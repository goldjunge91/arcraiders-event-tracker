import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Führt die Synchronisation alle 15 Minuten automatisch aus
crons.interval(
  "fetch-arcraiders-conditions",
  { minutes: 15 },
  api.events.fetchAndSyncLive
);

export default crons;
