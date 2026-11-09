import { defineConfig } from "vitest/config";

// The end-to-end test against the real Supertext API (test/e2e/live.e2e.ts), separate from
// `npm test`: it needs DATABASE_URL (PostgreSQL, migrated) and SUPERTEXT_API_KEY.
// Version reports off: CI runs are no installations for the Commando Center.
export default defineConfig({
  test: {
    root: new URL("../..", import.meta.url).pathname,
    include: ["test/e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
    env: { SUPERTEXT_VERSION_REPORTS: "0", SUPERTEXT_REPORT_URL: "http://127.0.0.1:9/report" },
  },
});
