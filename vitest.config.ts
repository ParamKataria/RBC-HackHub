/**
 * SOURCE OF TRUTH KEYWORDS: vitestConfig, testRunner, pathAlias, unitTesting, serverOnlyAlias
 * WHAT: Vitest test runner configuration for unit and integration testing.
 * WHY: Resolves @/ path aliases to the project root and stubs Next.js server-only for headless test execution.
 * WHERE: Root directory, invoked by npm run test.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
