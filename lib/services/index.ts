/**
 * SOURCE OF TRUTH KEYWORDS: catalogService, services barrel, Postgres catalog
 * WHAT: Namespace export for server-only catalog reads.
 * WHY: Pages import the service as an object instead of reaching into Postgres themselves.
 * WHERE: app/catalog pages.
 */
export * as archiveService from "./archive";
export * as askService from "./ask";
export * as catalogService from "./catalog";
export * as searchService from "./search";
