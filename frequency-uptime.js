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
    formatLocalDateTime
  };
});
