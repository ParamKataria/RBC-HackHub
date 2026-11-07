/**
 * SOURCE OF TRUTH KEYWORDS: serverOnlyMock, testMock, NextServerOnly, unitTesting, vitestAlias
 * WHAT: Empty mock stub for the Next.js server-only package during unit test execution.
 * WHY: node_modules/server-only throws at import time outside Next server compilation; this stub allows services to be tested in Vitest.
 * WHERE: vitest.config.ts resolve.alias for unit and integration test runs.
 */
export {};
