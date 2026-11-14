(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FrequencyUptime = factory();
  }
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : this), function () {
  "use strict";

  const MS_PER_HOUR = 60 * 60 * 1000;
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const REGION_KEYS = ["europe", "north-america", "south-america", "oceania", "asia"];
  const SCOPE_LABELS = {
    ALL: "All five regions",
    europe: "Europe",
    "north-america": "North America",
    "south-america": "South America",
    oceania: "Oceania",
    asia: "Asia"
  };

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function parseTimestamp(value) {
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    if (isFiniteNumber(value)) return value;
    if (typeof value !== "string" || value.trim() === "") return null;

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function getLocalTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    } catch (error) {
      return "local time";
    }
  }

  function getValidRegionalRanges(event) {
    const source = event && event.regionTimestamps;
    const ranges = {};
    if (!source || typeof source !== "object") return ranges;

    REGION_KEYS.forEach(regionKey => {
      const pair = source[regionKey];
      if (!Array.isArray(pair) || pair.length !== 2) return;

      const startMs = parseTimestamp(pair[0]);
      const endMs = parseTimestamp(pair[1]);
      if (startMs === null || endMs === null || endMs <= startMs) return;
      ranges[regionKey] = [startMs, endMs];
    });

    return ranges;
  }

  function getSlotKey(event) {
    return [event && event.condition, event && event.map, event && event.startTime]
      .map(value => String(value == null ? "" : value))
      .join("\u001f");
  }

  function mergeDuplicateSlots(first, second) {
    const merged = Object.assign({}, first, second);
    const firstRanges = getValidRegionalRanges(first);
    const secondRanges = getValidRegionalRanges(second);
    const mergedRanges = {};

    REGION_KEYS.forEach(regionKey => {
      if (secondRanges[regionKey]) {
        mergedRanges[regionKey] = secondRanges[regionKey];
      } else if (firstRanges[regionKey]) {
        mergedRanges[regionKey] = firstRanges[regionKey];
      }
    });

    if (Object.keys(mergedRanges).length > 0) {
      merged.regionTimestamps = Object.assign({}, merged.regionTimestamps, mergedRanges);
    }
    return merged;
  }

  function deduplicateSlots(events) {
    const slotsByKey = new Map();
    (Array.isArray(events) ? events : []).forEach(event => {
      if (!event || typeof event !== "object") return;
      const key = getSlotKey(event);
      if (!slotsByKey.has(key)) {
        slotsByKey.set(key, event);
      } else {
        slotsByKey.set(key, mergeDuplicateSlots(slotsByKey.get(key), event));
      }
    });
    return Array.from(slotsByKey.values());
  }

  function normalizeScope(scope) {
    return scope === "ALL" || REGION_KEYS.includes(scope) ? scope : "ALL";
  }

  function getScopeLabel(scope) {
    return SCOPE_LABELS[normalizeScope(scope)];
  }

  function getDateKey(timestamp) {
    const parsedTimestamp = parseTimestamp(timestamp);
    if (parsedTimestamp === null) return null;
    const date = new Date(parsedTimestamp);
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isDateTimeframe(timeframe) {
    return typeof timeframe === "string" && /^DATE:\d{4}-\d{2}-\d{2}$/.test(timeframe);
  }

  function normalizeTimeframe(timeframe) {
    if (["ALL", "TODAY", "WEEK"].includes(timeframe) || isDateTimeframe(timeframe)) {
      return timeframe;
    }
    return "ALL";
  }

  function getDateTimeframeWindow(timeframe, nowMs) {
    const dateKey = timeframe.slice("DATE:".length);
    const [year, month, day] = dateKey.split("-").map(Number);
    const startDate = new Date(year, month - 1, day);
    if (startDate.getFullYear() !== year || startDate.getMonth() !== month - 1 || startDate.getDate() !== day) {
      return null;
    }
    const nextDateStartMs = new Date(year, month - 1, day + 1).getTime();
    return {
      timeframe,
      startMs: startDate.getTime(),
      endMs: Math.min(nowMs, nextDateStartMs - 1)
    };
  }

  function getTimeWindow(timeframe, nowMs) {
    const safeNowMs = isFiniteNumber(nowMs) ? nowMs : Date.now();
    const normalizedTimeframe = normalizeTimeframe(timeframe);

    if (isDateTimeframe(normalizedTimeframe)) {
      return getDateTimeframeWindow(normalizedTimeframe, safeNowMs) || {
        timeframe: "ALL",
        startMs: null,
        endMs: safeNowMs
      };
    }

    if (normalizedTimeframe === "TODAY") {
      const now = new Date(safeNowMs);
      const localStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return {
        timeframe: normalizedTimeframe,
        startMs: localStartMs,
        endMs: safeNowMs
      };
    }

    if (normalizedTimeframe === "WEEK") {
      return {
        timeframe: normalizedTimeframe,
        startMs: safeNowMs - (7 * MS_PER_DAY),
        endMs: safeNowMs
      };
    }

    return {
      timeframe: "ALL",
      startMs: null,
      endMs: safeNowMs
    };
  }

  function getAvailableDateKeys(events, nowMs) {
    const safeNowMs = isFiniteNumber(nowMs) ? nowMs : Date.now();
    const observedDateKeys = [];
    deduplicateSlots(events).forEach(event => {
      const ranges = getValidRegionalRanges(event);
      const starts = Object.keys(ranges).length > 0
        ? Object.values(ranges).map(range => range[0])
        : [parseTimestamp(event.startTime)];
      starts.forEach(startMs => {
        if (startMs !== null && startMs <= safeNowMs) {
          const dateKey = getDateKey(startMs);
          if (dateKey) observedDateKeys.push(dateKey);
        }
      });
    });

    if (observedDateKeys.length === 0) return [];
    const firstDate = observedDateKeys.sort()[0].split("-").map(Number);
    const now = new Date(safeNowMs);
    const firstDateStart = new Date(firstDate[0], firstDate[1] - 1, firstDate[2]);
    const availableDateKeys = [];
    for (const date = new Date(firstDateStart); date <= now; date.setDate(date.getDate() + 1)) {
      availableDateKeys.push(getDateKey(date.getTime()));
    }
    return availableDateKeys;
  }

  function formatDateKey(dateKey) {
    if (typeof dateKey !== "string") return "";
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return dateKey;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function isInTimeWindow(startMs, timeWindow) {
    if (!isFiniteNumber(startMs)) return false;
    if (timeWindow.startMs !== null && startMs < timeWindow.startMs) return false;
    return startMs <= timeWindow.endMs;
  }

  function getStartedRegionalRanges(event, scope, nowMs) {
    const ranges = getValidRegionalRanges(event);
    const selectedScope = normalizeScope(scope);
    const regionKeys = selectedScope === "ALL" ? REGION_KEYS : [selectedScope];

    return regionKeys
      .filter(regionKey => ranges[regionKey])
      .map(regionKey => ({
        regionKey,
        startMs: ranges[regionKey][0],
        endMs: ranges[regionKey][1]
      }))
      .filter(range => range.startMs <= nowMs);
  }

  function hasStartedInScope(event, scope, nowMs) {
    const safeNowMs = isFiniteNumber(nowMs) ? nowMs : Date.now();
    const ranges = getValidRegionalRanges(event);
    if (Object.keys(ranges).length > 0) {
      return getStartedRegionalRanges(event, scope, safeNowMs).length > 0;
    }

    const globalStartMs = parseTimestamp(event && event.startTime);
    return normalizeScope(scope) === "ALL" && globalStartMs !== null && globalStartMs <= safeNowMs;
  }

  function matchesQuery(event, query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [event && event.condition, event && event.map]
      .some(value => String(value || "").toLowerCase().includes(normalizedQuery));
  }

  function addAggregate(map, name, slotCount, regionalCount, hours) {
    const current = map.get(name) || {
      name,
      rotationSlots: 0,
      regionalInstances: 0,
      serverHours: 0
    };
    current.rotationSlots += slotCount;
    current.regionalInstances += regionalCount;
    current.serverHours += hours;
    map.set(name, current);
  }

  function finalizeAggregates(map, totalSlots) {
    return Array.from(map.values())
      .map(entry => Object.assign({}, entry, {
        share: totalSlots > 0 ? entry.rotationSlots / totalSlots : 0
      }))
      .sort((a, b) => b.rotationSlots - a.rotationSlots || a.name.localeCompare(b.name));
  }

  function buildFrequencyView(events, options) {
    const settings = options || {};
    const scope = normalizeScope(settings.scope);
    const nowMs = isFiniteNumber(settings.nowMs) ? settings.nowMs : Date.now();
    const timeWindow = getTimeWindow(settings.timeframe || "ALL", nowMs);
    const query = settings.query || "";
    const conditionAggregates = new Map();
    const mapAggregates = new Map();
    const selectedRecords = [];
    const partialRecords = [];
    let rotationSlots = 0;
    let regionalInstances = 0;
    let serverHours = 0;
    let unscopedSlots = 0;
    let actualStartMs = null;

    deduplicateSlots(events)
      .filter(event => matchesQuery(event, query))
      .forEach(event => {
        const validRanges = getValidRegionalRanges(event);
        const validRegionKeys = Object.keys(validRanges);
        const isUnscoped = validRegionKeys.length === 0;
        const isPartial = validRegionKeys.length > 0 && validRegionKeys.length < REGION_KEYS.length;
        const allStartedRanges = getStartedRegionalRanges(event, "ALL", nowMs)
          .filter(range => isInTimeWindow(range.startMs, timeWindow));
        const globalStartMs = parseTimestamp(event.startTime);
        const globalStartInWindow = globalStartMs !== null &&
          globalStartMs <= nowMs && isInTimeWindow(globalStartMs, timeWindow);
        const qualityRecordIsInWindow = allStartedRanges.length > 0 || (isUnscoped && globalStartInWindow);

        if (!qualityRecordIsInWindow) return;
        if (isUnscoped) {
          unscopedSlots += 1;
        } else if (isPartial) {
          partialRecords.push(event);
        }

        let startedRanges = getStartedRegionalRanges(event, scope, nowMs)
          .filter(range => isInTimeWindow(range.startMs, timeWindow));
        let slotStartMs = startedRanges.length > 0
          ? Math.min(...startedRanges.map(range => range.startMs))
          : null;
        let includedAsUnscoped = false;

        if (scope === "ALL" && isUnscoped && globalStartInWindow) {
          includedAsUnscoped = true;
          slotStartMs = globalStartMs;
          startedRanges = [];
        }

        if (startedRanges.length === 0 && !includedAsUnscoped) return;

        const condition = event.condition || "Unknown condition";
        const map = event.map || "Unknown map";
        const rangeHours = startedRanges.reduce((sum, range) => {
          return sum + ((range.endMs - range.startMs) / MS_PER_HOUR);
        }, 0);
        const currentRegionalInstances = startedRanges.length;

        rotationSlots += 1;
        regionalInstances += currentRegionalInstances;
        serverHours += rangeHours;
        actualStartMs = actualStartMs === null ? slotStartMs : Math.min(actualStartMs, slotStartMs);
        addAggregate(conditionAggregates, condition, 1, currentRegionalInstances, rangeHours);
        addAggregate(mapAggregates, map, 1, currentRegionalInstances, rangeHours);
        selectedRecords.push({
          event,
          slotStartMs,
          regionalInstances: currentRegionalInstances,
          serverHours: rangeHours,
          unscoped: includedAsUnscoped
        });
      });

    const actualTimeWindow = Object.assign({}, timeWindow, {
      startMs: timeWindow.startMs === null ? actualStartMs : timeWindow.startMs
    });

    return {
      scope,
      scopeLabel: getScopeLabel(scope),
      timezone: getLocalTimeZone(),
      timeframe: timeWindow.timeframe,
      timeWindow: actualTimeWindow,
      requestedTimeWindow: timeWindow,
      rotationSlots,
      regionalInstances,
      serverHours,
      maps: finalizeAggregates(mapAggregates, rotationSlots),
      conditions: finalizeAggregates(conditionAggregates, rotationSlots),
      unscopedSlots,
      incompleteRegionalData: partialRecords.length,
      partialRegionalSlots: partialRecords,
      records: selectedRecords,
      empty: rotationSlots === 0
    };
  }

  function formatLocalDateTime(timestamp, options) {
    const parsedTimestamp = parseTimestamp(timestamp);
    if (parsedTimestamp === null) return "—";
    const formatOptions = Object.assign({ dateStyle: "medium", timeStyle: "short" }, options || {});
    return new Intl.DateTimeFormat(undefined, formatOptions).format(new Date(parsedTimestamp));
  }

  function buildRotationIntelligence(events, options) {
    const targetCondition = (options && options.condition) || "";
    const nowMs = isFiniteNumber(options && options.nowMs) ? options.nowMs : Date.now();
    const timeframe = (options && options.timeframe) || "ALL";
    const scope = (options && options.scope) || "ALL";
    const query = (options && options.query) || "";

    const view = buildFrequencyView(events, { scope, timeframe, query, nowMs });
    const records = view.records || [];

    const slotsByStartTime = new Map();
    records.forEach(rec => {
      const st = rec.event.startTime;
      if (!slotsByStartTime.has(st)) {
        slotsByStartTime.set(st, []);
      }
      slotsByStartTime.get(st).push(rec.event);
    });

    const targetSlots = records
      .map(r => r.event)
      .filter(e => e.condition === targetCondition);

    const hasData = targetSlots.length > 0;

    // 1. Map Breakdown
    const mapCounts = {};
    const mapLastSeen = {};
    const mapActiveNow = {};

    targetSlots.forEach(slot => {
      const map = slot.map;
      mapCounts[map] = (mapCounts[map] || 0) + 1;
      const stMs = parseTimestamp(slot.startTime) || 0;
      const etMs = parseTimestamp(slot.endTime) || (stMs + MS_PER_HOUR);
      if (!mapLastSeen[map] || stMs > mapLastSeen[map].timestamp) {
        mapLastSeen[map] = {
          timestamp: stMs,
          endTimestamp: etMs,
          formatted: formatLocalDateTime(stMs)
        };
      }
      if (stMs <= nowMs && nowMs < etMs) {
        mapActiveNow[map] = true;
      }
    });

    const mapBreakdown = Object.keys(mapCounts)
      .map(map => {
        const count = mapCounts[map];
        const percentage = targetSlots.length > 0 ? (count / targetSlots.length) * 100 : 0;
        return {
          map,
          count,
          percentage: Math.round(percentage * 10) / 10,
          lastSeen: mapLastSeen[map],
          isActive: !!mapActiveNow[map]
        };
      })
      .sort((a, b) => b.count - a.count);

    // 2. Status & Downtime / Cooldown Tracker
    let isActiveNow = false;
    const activeMaps = [];
    let remainingMinutes = 0;
    let lastSeenTimestamp = null;
    let lastSeenStartMs = null;

    targetSlots.forEach(slot => {
      const stMs = parseTimestamp(slot.startTime) || 0;
      const etMs = parseTimestamp(slot.endTime) || (stMs + MS_PER_HOUR);
      if (stMs <= nowMs && nowMs < etMs) {
        isActiveNow = true;
        if (!activeMaps.includes(slot.map)) activeMaps.push(slot.map);
        remainingMinutes = Math.max(remainingMinutes, Math.round((etMs - nowMs) / 60000));
      }
      if (lastSeenTimestamp === null || etMs > lastSeenTimestamp) {
        lastSeenTimestamp = etMs;
        lastSeenStartMs = stMs;
      }
    });

    let downtimeMs = 0;
    let downtimeHours = 0;
    let downtimeMinutes = 0;

    if (isActiveNow) {
      downtimeMs = 0;
    } else if (lastSeenTimestamp !== null) {
      downtimeMs = Math.max(0, nowMs - lastSeenTimestamp);
      downtimeHours = Math.floor(downtimeMs / MS_PER_HOUR);
      downtimeMinutes = Math.floor((downtimeMs % MS_PER_HOUR) / (60 * 1000));
    }

    // 3. Cadence & Gap Analysis (Rhythm between rotations)
    const uniqueStartTimes = Array.from(new Set(targetSlots.map(s => parseTimestamp(s.startTime))))
      .filter(t => t !== null)
      .sort((a, b) => a - b);

    const gapsHours = [];
    for (let i = 1; i < uniqueStartTimes.length; i++) {
      const diffHours = (uniqueStartTimes[i] - uniqueStartTimes[i - 1]) / MS_PER_HOUR;
      gapsHours.push(diffHours);
    }

    const rawAvgInterval = gapsHours.length > 0 ? (gapsHours.reduce((a, b) => a + b, 0) / gapsHours.length) : 0;
    const avgIntervalHours = Math.round(rawAvgInterval * 10) / 10;
    const minIntervalHours = gapsHours.length > 0 ? Math.round(Math.min(...gapsHours) * 10) / 10 : 0;
    const maxIntervalHours = gapsHours.length > 0 ? Math.round(Math.max(...gapsHours) * 10) / 10 : 0;
    const avgPauseHours = Math.max(0, Math.round((rawAvgInterval - 1.0) * 10) / 10);

    // 4. Concurrency Analysis (Which conditions ran simultaneously with targetCondition)
    const concurrentCounts = {};
    const sharedSlotsMap = {};

    slotsByStartTime.forEach((eventsInHour, startTimeKey) => {
      const targetEventsInHour = eventsInHour.filter(e => e.condition === targetCondition);
      if (targetEventsInHour.length === 0) return;

      const otherEventsInHour = eventsInHour.filter(e => e.condition && e.condition !== targetCondition);
      const seenOtherInThisHour = new Set();

      otherEventsInHour.forEach(otherEvent => {
        const otherCond = otherEvent.condition;
        if (!seenOtherInThisHour.has(otherCond)) {
          seenOtherInThisHour.add(otherCond);
          concurrentCounts[otherCond] = (concurrentCounts[otherCond] || 0) + 1;
        }
        if (!sharedSlotsMap[otherCond]) sharedSlotsMap[otherCond] = [];
        targetEventsInHour.forEach(te => {
          sharedSlotsMap[otherCond].push({
            startTime: startTimeKey,
            targetMap: te.map,
            otherMap: otherEvent.map
          });
        });
      });
    });

    const concurrentConditions = Object.keys(concurrentCounts)
      .map(otherCond => {
        const sharedSlots = concurrentCounts[otherCond];
        const percentage = uniqueStartTimes.length > 0 ? (sharedSlots / uniqueStartTimes.length) * 100 : 0;
        return {
          condition: otherCond,
          sharedSlots,
          percentage: Math.round(percentage * 10) / 10,
          pairSlots: sharedSlotsMap[otherCond] || []
        };
      })
      .sort((a, b) => b.sharedSlots - a.sharedSlots);

    return {
      targetCondition,
      hasData,
      totalSlots: targetSlots.length,
      uniqueHours: uniqueStartTimes.length,
      isActiveNow,
      activeMaps,
      remainingMinutes,
      lastSeenTimestamp,
      lastSeenStartMs,
      lastSeenFormatted: lastSeenStartMs !== null ? formatLocalDateTime(lastSeenStartMs) : "—",
      downtimeMs,
      downtimeHours,
      downtimeMinutes,
      avgIntervalHours,
      avgPauseHours,
      minIntervalHours,
      maxIntervalHours,
      mapBreakdown,
      concurrentConditions,
      totalUniqueHours: slotsByStartTime.size
    };
  }

  function buildConcurrencyMatrix(events, options) {
    const nowMs = isFiniteNumber(options && options.nowMs) ? options.nowMs : Date.now();
    const timeframe = (options && options.timeframe) || "ALL";
    const scope = (options && options.scope) || "ALL";
    const query = (options && options.query) || "";

    const view = buildFrequencyView(events, { scope, timeframe, query, nowMs });
    const records = view.records || [];

    const slotsByStartTime = new Map();
    const condCounts = {};

    records.forEach(rec => {
      const st = rec.event.startTime;
      if (!slotsByStartTime.has(st)) slotsByStartTime.set(st, []);
      slotsByStartTime.get(st).push(rec.event);
      condCounts[rec.event.condition] = (condCounts[rec.event.condition] || 0) + 1;
    });

    const pairCounts = new Map();
    const pairMapBreakdown = new Map();

    slotsByStartTime.forEach((eventsInHour, startTime) => {
      const condSet = new Set(eventsInHour.map(e => e.condition));
      const condList = Array.from(condSet);

      for (let i = 0; i < condList.length; i++) {
        for (let j = 0; j < condList.length; j++) {
          if (i === j) continue;
          const c1 = condList[i];
          const c2 = condList[j];
          const key = `${c1}\u001f${c2}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);

          const e1List = eventsInHour.filter(e => e.condition === c1);
          const e2List = eventsInHour.filter(e => e.condition === c2);
          if (!pairMapBreakdown.has(key)) pairMapBreakdown.set(key, {});
          const breakdown = pairMapBreakdown.get(key);
          e1List.forEach(e1 => {
            e2List.forEach(e2 => {
              const mapPair = `${e1.map} + ${e2.map}`;
              breakdown[mapPair] = (breakdown[mapPair] || 0) + 1;
            });
          });
        }
      }
    });

    const activeConditions = Object.keys(condCounts).sort((a, b) => condCounts[b] - condCounts[a]);

    return {
      totalHours: slotsByStartTime.size,
      activeConditions,
      getPairCount: (c1, c2) => pairCounts.get(`${c1}\u001f${c2}`) || 0,
      getPairMapBreakdown: (c1, c2) => pairMapBreakdown.get(`${c1}\u001f${c2}`) || {}
    };
  }

  return {
    MS_PER_HOUR,
    REGION_KEYS: REGION_KEYS.slice(),
    SCOPE_LABELS: Object.assign({}, SCOPE_LABELS),
    parseTimestamp,
    getLocalTimeZone,
    getValidRegionalRanges,
    getSlotKey,
    deduplicateSlots,
    getDateKey,
    getAvailableDateKeys,
    formatDateKey,
    getTimeWindow,
    getStartedRegionalRanges,
    hasStartedInScope,
    buildFrequencyView,
    buildRotationIntelligence,
    buildConcurrencyMatrix,
    formatLocalDateTime
  };
});
