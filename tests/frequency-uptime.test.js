const test = require("node:test");
const assert = require("node:assert/strict");
const FrequencyUptime = require("../frequency-uptime.js");

const HOUR = FrequencyUptime.MS_PER_HOUR;
const NOW = new Date(2026, 10, 14, 12, 30, 0, 0).getTime();

function range(startMs, durationHours = 1) {
  return [startMs, startMs + (durationHours * HOUR)];
}

function regionalRanges(startMs, keys = FrequencyUptime.REGION_KEYS) {
  return Object.fromEntries(keys.map((key, index) => [key, range(startMs + (index * HOUR))]));
}

function sameRegionalRanges(startMs, keys = FrequencyUptime.REGION_KEYS) {
  return Object.fromEntries(keys.map(key => [key, range(startMs)]));
}

function localTimestamp(timestamp) {
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function event(condition, map, startMs, regionTimestamps, extra = {}) {
  return {
    condition,
    map,
    startTime: localTimestamp(startMs),
    endTime: localTimestamp(startMs + HOUR),
    durationMinutes: 60,
    ...(regionTimestamps === undefined ? {} : { regionTimestamps }),
    ...extra
  };
}

const fullSlot = event("Full", "Dam", NOW - (5 * HOUR), regionalRanges(NOW - (5 * HOUR)));
const duplicateFullSlot = event("Full", "Dam", NOW - (5 * HOUR), {
  europe: range(NOW - (5 * HOUR)),
  "north-america": range(NOW - (4 * HOUR)),
  "south-america": range(NOW - (3 * HOUR)),
  oceania: range(NOW - (2 * HOUR)),
  asia: range(NOW - HOUR)
});
const singleRegionSlot = event("Single", "Spaceport", NOW - (4 * HOUR), {
  europe: range(NOW - (4 * HOUR))
});
const runningSlot = event("Running", "Riven Tides", NOW - (30 * 60 * 1000), regionalRanges(NOW - (30 * 60 * 1000)));
const endedSlot = event("Ended", "The Blue Gate", NOW - (10 * HOUR), regionalRanges(NOW - (10 * HOUR)));
const futureSlot = event("Future", "Buried City", NOW + HOUR, regionalRanges(NOW + HOUR));
const unscopedSlot = event("Unscoped", "Pendola Pass", NOW - (2 * HOUR), undefined);

const fixture = [
  fullSlot,
  duplicateFullSlot,
  singleRegionSlot,
  runningSlot,
  endedSlot,
  futureSlot,
  unscopedSlot
];

test("counts global slots once and keeps regional/server-hour units separate", () => {
  const view = FrequencyUptime.buildFrequencyView(fixture, { nowMs: NOW, scope: "ALL", timeframe: "ALL" });

  assert.equal(view.rotationSlots, 5);
  assert.equal(view.regionalInstances, 12);
  assert.equal(view.serverHours, 12);
  assert.equal(view.unscopedSlots, 1);
  assert.equal(view.incompleteRegionalData, 1);
  assert.equal(view.maps.length, 5);
  assert.equal(view.conditions.find(item => item.name === "Full").rotationSlots, 1);
  assert.equal(view.conditions.find(item => item.name === "Full").regionalInstances, 5);
});

test("counts only the selected region and never fills missing regions", () => {
  const europe = FrequencyUptime.buildFrequencyView(fixture, {
    nowMs: NOW,
    scope: "europe",
    timeframe: "ALL"
  });
  const asia = FrequencyUptime.buildFrequencyView(fixture, {
    nowMs: NOW,
    scope: "asia",
    timeframe: "ALL"
  });

  assert.equal(europe.rotationSlots, 4);
  assert.equal(europe.regionalInstances, 4);
  assert.equal(europe.serverHours, 4);
  assert.equal(asia.rotationSlots, 2);
  assert.equal(asia.regionalInstances, 2);
  assert.equal(asia.serverHours, 2);
  assert.equal(europe.unscopedSlots, 1);
});

test("keeps running and ended slots but excludes future slots", () => {
  const view = FrequencyUptime.buildFrequencyView(fixture, { nowMs: NOW, scope: "ALL" });
  const names = view.conditions.map(item => item.name);

  assert.ok(names.includes("Running"));
  assert.ok(names.includes("Ended"));
  assert.ok(!names.includes("Future"));
});

test("excludes future regional ranges from a partially started slot", () => {
  const partial = event("Partial", "Dam", NOW - HOUR, {
    europe: range(NOW - HOUR),
    asia: range(NOW + HOUR)
  });

  const allRegions = FrequencyUptime.buildFrequencyView([partial], { nowMs: NOW, scope: "ALL" });
  const asia = FrequencyUptime.buildFrequencyView([partial], { nowMs: NOW, scope: "asia" });

  assert.equal(allRegions.rotationSlots, 1);
  assert.equal(allRegions.regionalInstances, 1);
  assert.equal(allRegions.serverHours, 1);
  assert.equal(allRegions.incompleteRegionalData, 1);
  assert.equal(asia.rotationSlots, 0);
  assert.equal(asia.regionalInstances, 0);
});

test("uses browser-local calendar boundaries for TODAY and a rolling WEEK", () => {
  const todaySlot = event("Today", "Dam", new Date(2026, 10, 14, 9, 0).getTime(), sameRegionalRanges(new Date(2026, 10, 14, 9, 0).getTime()));
  const yesterdaySlot = event("Yesterday", "Dam", new Date(2026, 10, 13, 23, 0).getTime(), sameRegionalRanges(new Date(2026, 10, 13, 23, 0).getTime()));
  const oldSlot = event("Old", "Dam", NOW - (8 * 24 * HOUR), sameRegionalRanges(NOW - (8 * 24 * HOUR)));

  const today = FrequencyUptime.buildFrequencyView([todaySlot, yesterdaySlot], {
    nowMs: NOW,
    scope: "ALL",
    timeframe: "TODAY"
  });
  const week = FrequencyUptime.buildFrequencyView([todaySlot, yesterdaySlot, oldSlot], {
    nowMs: NOW,
    scope: "ALL",
    timeframe: "WEEK"
  });

  assert.equal(today.rotationSlots, 1);
  assert.deepEqual(today.conditions.map(item => item.name), ["Today"]);
  assert.equal(week.rotationSlots, 2);
  assert.ok(week.timeWindow.startMs <= NOW - (7 * 24 * HOUR));
  assert.equal(week.timeWindow.endMs, NOW);
});

test("supports concrete local tracking days and never offers future dates", () => {
  const todayStart = new Date(2026, 10, 14, 9, 0).getTime();
  const yesterdayStart = new Date(2026, 10, 13, 23, 0).getTime();
  const todaySlot = event("Today", "Dam", todayStart, sameRegionalRanges(todayStart));
  const yesterdaySlot = event("Yesterday", "Dam", yesterdayStart, sameRegionalRanges(yesterdayStart));
  const futureDayStart = new Date(2026, 10, 15, 1, 0).getTime();
  const futureDaySlot = event("Future day", "Dam", futureDayStart, sameRegionalRanges(futureDayStart));
  const view = FrequencyUptime.buildFrequencyView([todaySlot, yesterdaySlot], {
    nowMs: NOW,
    scope: "ALL",
    timeframe: "DATE:2026-11-14"
  });

  assert.equal(view.rotationSlots, 1);
  assert.deepEqual(view.conditions.map(item => item.name), ["Today"]);
  assert.deepEqual(FrequencyUptime.getAvailableDateKeys([todaySlot, yesterdaySlot, futureSlot, futureDaySlot], NOW), ["2026-11-13", "2026-11-14"]);
  assert.equal(FrequencyUptime.buildFrequencyView([futureSlot], {
    nowMs: NOW,
    scope: "ALL",
    timeframe: "DATE:2026-11-15"
  }).rotationSlots, 0);
});


test("returns an empty result without inventing an off-rotation status", () => {
  const view = FrequencyUptime.buildFrequencyView(fixture, {
    nowMs: NOW,
    scope: "europe",
    timeframe: "TODAY",
    query: "does-not-exist"
  });

  assert.equal(view.rotationSlots, 0);
  assert.equal(view.regionalInstances, 0);
  assert.equal(view.serverHours, 0);
  assert.deepEqual(view.conditions, []);
  assert.deepEqual(view.maps, []);
  assert.equal(Object.prototype.hasOwnProperty.call(view, "offRotation"), false);
});

test("exposes local timezone and valid regional range helpers", () => {
  const ranges = FrequencyUptime.getValidRegionalRanges(fullSlot);
  assert.deepEqual(ranges.europe, range(NOW - (5 * HOUR)));
  assert.equal(FrequencyUptime.getValidRegionalRanges(unscopedSlot).europe, undefined);
  assert.equal(FrequencyUptime.hasStartedInScope(futureSlot, "ALL", NOW), false);
  assert.equal(typeof FrequencyUptime.getLocalTimeZone(), "string");
});
