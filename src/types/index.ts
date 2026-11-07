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

export { parseSearchParams, recordTypeValues, searchQuerySchema } from "./search";
export type { SearchQuery, SearchResponse } from "./search";

export { askErrorSchema, askQuestionSchema, askResponseSchema, askViewSchema, noArchiveSourceMessage } from "./ask";
export type { AskCitation, AskError, AskQuestion, AskResponse, AskView } from "./ask";

export {
  archiveCollectionSchema,
  archiveFilterSchema,
  archiveImageProxyQuerySchema,
  archivePayloadSchema,
  archiveStationSchema,
  collectionKeySchema,
  collectionKeyValues,
} from "./museum";
export type {
  AppMode,
  ArchiveGateView,
  ArchiveCollection,
  ArchiveFilter,
  ArchiveImageProxyQuery,
  ArchivePayload,
  ArchiveStation,
  CameraFaderController,
  CollectionKey,
  CollectionVoice,
  LoadedHallTextures,
  MuseumRoomBuildResult,
  PortalConfig,
  PortalEnergyController,
  PortalLightsController,
  PortalPreviewController,
  RoomConfigMetrics,
  RoomLimitConfig,
  RoomPortalTheme,
  StationPictureShaderController,
} from "./museum";

