/**
 * SOURCE OF TRUTH KEYWORDS: catalog types, CatalogRecord, CatalogQuery, ConnectionsGraph, barrel
 * WHAT: Re-exports shared catalog, search, ask, museum, and connections types.
 * WHY: Callers import shared schemas and types from one barrel module.
 * WHERE: Services, API routes, and catalog/archive pages.
 */
export {
  catalogQuerySchema,
  catalogRecordDetailSchema,
  catalogRecordPageParamsSchema,
  catalogRecordSchema,
  catalogSearchParamsInputSchema,
  catalogSearchParamsSchema,
  catalogTotalsSchema,
  catalogViewSchema,
  linkedListPropsSchema,
  parseCatalogSearchParams,
  recordIdSchema,
} from "./catalog";

export type {
  CatalogPageProps,
  CatalogQuery,
  CatalogRecord,
  CatalogRecordDetail,
  CatalogRecordPageParams,
  CatalogRecordPageProps,
  CatalogSearchParams,
  CatalogSearchParamsInput,
  CatalogTotals,
  CatalogView,
  LinkedListProps,
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

export {
  activeGraphRecordsSelectionSchema,
  catalogResultsViewPropsSchema,
  catalogViewModeSchema,
  catalogViewModeValues,
  connectionsGraphOptionsSchema,
  connectionsGraphSchema,
  connectionsGraphViewPropsSchema,
  d3SimulationLinkSchema,
  d3SimulationNodeSchema,
  extractedGraphEntitySchema,
  graphActiveNeighborhoodSchema,
  graphCategoryMetaSchema,
  graphEdgeRelationSchema,
  graphEdgeRelationValues,
  graphEdgeSchema,
  graphEntityCategorySchema,
  graphEntityCategoryValues,
  graphEntityFilterParamSchema,
  graphEntityFilterParamValues,
  graphEntityOccurrenceSchema,
  graphNeighborItemSchema,
  graphNodeCategorySchema,
  graphNodeCategoryValues,
  graphNodeSchema,
  graphPointSchema,
  graphRecordInputSchema,
  scoredGraphRecordSchema,
} from "./connections";
export type {
  ActiveGraphRecordsSelection,
  CatalogResultsViewProps,
  CatalogViewMode,
  ConnectionsGraph,
  ConnectionsGraphOptions,
  ConnectionsGraphViewProps,
  D3SimulationLink,
  D3SimulationNode,
  ExtractedGraphEntity,
  GraphActiveNeighborhood,
  GraphCategoryMeta,
  GraphEdge,
  GraphEdgeRelation,
  GraphEntityCategory,
  GraphEntityFilterParam,
  GraphEntityOccurrence,
  GraphNeighborItem,
  GraphNode,
  GraphNodeCategory,
  GraphPoint,
  GraphRecordInput,
  ScoredGraphRecord,
} from "./connections";
