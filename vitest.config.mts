import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // The transit regression suite is pinned to the Oakland slice -- real stop
    // ids, real ride times, a real weekday. Moving the app to Hudson County
    // must not quietly delete the only regression tests this layer has, so the
    // suite keeps running against Pittsburgh while the app defaults to Jersey
    // City. The Hudson slice is covered separately, against its own data.
    // TZ, because Orbit is a clock. `naturalDue` and the ledger compare
    // calendar days in the *local* zone, and the whole domain is a student in
    // New Jersey -- the production code pins America/New_York in half a dozen
    // places. Tests that build a Date at "19:00-04:00" and expect "due
    // tonight" are asserting in that zone whether they say so or not, so the
    // runner says so. Without it the suite passes in New York and fails in
    // UTC, which is exactly what CI is.
    env: { ORBIT_REGION: "oakland", TZ: "America/New_York" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
