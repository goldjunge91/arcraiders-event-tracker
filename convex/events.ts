import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Mutation: Speichert Events ab, verhindert Duplikate anhand von (condition, map, startTime)
export const upsertEvents = mutation({
  args: {
    events: v.array(
      v.object({
        condition: v.string(),
        map: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        durationMinutes: v.number(),
        slug: v.string(),
        url: v.string(),
        timer: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const nowIso = new Date().toISOString();
    let inserted = 0;
    let updated = 0;

    for (const ev of args.events) {
      const existing = await ctx.db
        .query("map_events")
        .withIndex("by_condition_map_start", (q) =>
          q
            .eq("condition", ev.condition)
            .eq("map", ev.map)
            .eq("startTime", ev.startTime)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          endTime: ev.endTime,
          durationMinutes: ev.durationMinutes,
          timer: ev.timer,
          lastSeenAt: nowIso,
        });
        updated++;
      } else {
        await ctx.db.insert("map_events", {
          ...ev,
          lastSeenAt: nowIso,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

// Query: Alle aktuell aktiven Events
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const all = await ctx.db.query("map_events").collect();
    return all.filter((e) => e.startTime <= now && e.endTime >= now);
  },
});

// Query: Zukünftige Events
export const getUpcoming = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const limit = args.limit ?? 20;
    const events = await ctx.db
      .query("map_events")
      .withIndex("by_start_time", (q) => q.gt("startTime", now))
      .order("asc")
      .take(limit);
    return events;
  },
});

// Query: Statistiken & Rotationsdauer
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("map_events").collect();
    const stats: Record<string, { count: number; totalMinutes: number; maps: Set<string> }> = {};

    for (const ev of all) {
      if (!stats[ev.condition]) {
        stats[ev.condition] = { count: 0, totalMinutes: 0, maps: new Set() };
      }
      stats[ev.condition].count += 1;
      stats[ev.condition].totalMinutes += ev.durationMinutes;
      stats[ev.condition].maps.add(ev.map);
    }

    return Object.entries(stats).map(([condition, data]) => ({
      condition,
      count: data.count,
      avgDurationMinutes: Math.round(data.totalMinutes / data.count),
      maps: Array.from(data.maps),
    }));
  },
});

// Action: Fetcht die Website und ruft die Mutation auf (kann vom Cron-Job getriggert werden)
export const fetchAndSyncLive = action({
  args: {},
  handler: async (ctx) => {
    try {
      const res = await fetch("https://arcraiders.com/de/map-conditions", {
        headers: {
          "User-Agent": "Mozilla/5.0 (ARC Raiders Event Tracker)",
        },
      });
      const html = await res.text();
      // Hier kann der HTML-Parser laufen oder strukturierte Daten extrahieren
      console.log(`Fetched ${html.length} bytes from arcraiders.com`);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  },
});
