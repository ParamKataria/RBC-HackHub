/**
 * SOURCE OF TRUTH KEYWORDS: catalog types, CatalogRecord, CatalogQuery, barrel
 * WHAT: Re-exports shared catalog types.
 * WHY: Callers import catalog types from one module.
 * WHERE: Catalog service and catalog pages.
 */
export {
  catalogQuerySchema,
  catalogRecordDetailSchema,
  catalogRecordSchema,
  catalogTotalsSchema,
  parseCatalogSearchParams,
  recordIdSchema,
} from "./catalog";

export type {
  CatalogQuery,
  CatalogRecord,
  CatalogRecordDetail,
  CatalogTotals,
  CatalogView,
} from "./catalog";

export { fieldLabel, schemaFieldMap } from "./schema-map";
export type { SchemaField, SchemaFieldKey } from "./schema-map";
