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
    env: { ORBIT_REGION: "oakland" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
