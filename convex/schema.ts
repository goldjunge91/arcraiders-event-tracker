import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  map_events: defineTable({
    condition: v.string(),        // z.B. "Night Raid", "ARC Frigate"
    map: v.string(),              // z.B. "Buried City", "Spaceport"
    startTime: v.string(),        // ISO-8601 Timestamp
    endTime: v.string(),          // ISO-8601 Timestamp
    durationMinutes: v.number(),  // z.B. 60
    slug: v.string(),             // z.B. "night-raid"
    url: v.string(),              // Link zur Detailseite
    timer: v.optional(v.string()),// z.B. "3:07"
    lastSeenAt: v.string(),
  })
    .index("by_condition", ["condition"])
    .index("by_map", ["map"])
    .index("by_start_time", ["startTime"])
    .index("by_condition_map_start", ["condition", "map", "startTime"]),
});
