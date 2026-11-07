import { z } from "zod";

import { catalogRecordDetailSchema, catalogRecordSchema } from "./catalog";

/**
 * SOURCE OF TRUTH KEYWORDS: GraphNode, GraphEdge, ConnectionsGraph, GraphNodeCategory, CatalogViewMode, buildConnectionsGraph
 * WHAT: Zod schemas and TypeScript types for the Catalog Connection Graph and catalog view switcher.
 * WHY: Ensures all graph nodes, edges, coordinates, and component inputs derived from Postgres catalog rows are strictly validated in one shared types module.
 * WHERE: src/lib/connections/graph-builder.ts, app/catalog/_components/connections-graph.tsx, and app/catalog/_components/catalog-results-view.tsx.
 */

export const graphNodeCategoryValues = [
  "record",
  "institution",
  "person",
  "place",
  "subject",
  "community",
] as const;

export const graphNodeCategorySchema = z.enum(graphNodeCategoryValues);

export type GraphNodeCategory = z.infer<typeof graphNodeCategorySchema>;

export const graphEntityCategoryValues = [
  "institution",
  "person",
  "place",
  "subject",
  "community",
] as const;

export const graphEntityCategorySchema = z.enum(graphEntityCategoryValues);

export type GraphEntityCategory = z.infer<typeof graphEntityCategorySchema>;

export const graphEdgeRelationValues = [
  "held by",
  "creator / contributor",
  "located in",
  "subject",
  "community",
] as const;

export const graphEdgeRelationSchema = z.enum(graphEdgeRelationValues);

export type GraphEdgeRelation = z.infer<typeof graphEdgeRelationSchema>;

export const graphPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type GraphPoint = z.infer<typeof graphPointSchema>;

export const graphCategoryMetaSchema = z.object({
  label: z.string().min(1),
  nodeClass: z.string().min(1),
  swatchClass: z.string().min(1),
});

export type GraphCategoryMeta = z.infer<typeof graphCategoryMetaSchema>;

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  category: graphNodeCategorySchema,
  subtitle: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
  ringRadius: z.number().nonnegative(),
  degree: z.number().int().nonnegative(),
  isFocal: z.boolean(),
  recordId: z.string().uuid().nullable(),
  externalUrl: z.string().nullable(),
  filterHref: z.string().nullable(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relation: graphEdgeRelationSchema,
});

export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const connectionsGraphOptionsSchema = z.object({
  focalRecordId: z.string().uuid().nullable().optional(),
  maxRecords: z.number().int().min(1).max(100).optional(),
});

export type ConnectionsGraphOptions = z.infer<typeof connectionsGraphOptionsSchema>;

export const connectionsGraphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  focalRecordId: z.string().uuid().nullable(),
  totalRecords: z.number().int().nonnegative(),
  institutionCount: z.number().int().nonnegative(),
  sharedEntityCount: z.number().int().nonnegative(),
});

export type ConnectionsGraph = z.infer<typeof connectionsGraphSchema>;

export const catalogViewModeValues = ["list", "graph"] as const;

export const catalogViewModeSchema = z.enum(catalogViewModeValues);

export type CatalogViewMode = z.infer<typeof catalogViewModeSchema>;

export const graphRecordInputSchema = z.union([
  catalogRecordDetailSchema,
  catalogRecordSchema,
]);

export type GraphRecordInput = z.infer<typeof graphRecordInputSchema>;

export const graphEntityFilterParamValues = [
  "institution",
  "creator",
  "q",
  "place",
  "subject",
] as const;

export const graphEntityFilterParamSchema = z.enum(
  graphEntityFilterParamValues,
);

export type GraphEntityFilterParam = z.infer<
  typeof graphEntityFilterParamSchema
>;

export const extractedGraphEntitySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  category: graphEntityCategorySchema,
  relation: graphEdgeRelationSchema,
  subtitle: z.string(),
  filterHref: z.string().min(1),
});

export type ExtractedGraphEntity = z.infer<typeof extractedGraphEntitySchema>;

export const scoredGraphRecordSchema = z.object({
  record: graphRecordInputSchema,
  score: z.number(),
});

export type ScoredGraphRecord = z.infer<typeof scoredGraphRecordSchema>;

export const activeGraphRecordsSelectionSchema = z.object({
  activeRecords: z.array(graphRecordInputSchema),
  resolvedFocalId: z.string().uuid().nullable(),
  entitiesByRecordId: z.map(
    z.string().uuid(),
    z.array(extractedGraphEntitySchema),
  ),
});

export type ActiveGraphRecordsSelection = z.infer<
  typeof activeGraphRecordsSelectionSchema
>;

export const graphEntityOccurrenceSchema = z.object({
  entity: extractedGraphEntitySchema,
  recordIds: z.set(z.string().uuid()),
});

export type GraphEntityOccurrence = z.infer<typeof graphEntityOccurrenceSchema>;

export const graphNeighborItemSchema = z.object({
  node: graphNodeSchema,
  relation: graphEdgeRelationSchema,
});

export type GraphNeighborItem = z.infer<typeof graphNeighborItemSchema>;

export const graphActiveNeighborhoodSchema = z.object({
  connectedNodeIds: z.set(z.string().min(1)),
  activeNeighbors: z.array(graphNeighborItemSchema),
});

export type GraphActiveNeighborhood = z.infer<
  typeof graphActiveNeighborhoodSchema
>;

export const d3SimulationNodeSchema = z.object({
  id: z.string().min(1),
  radius: z.number().positive(),
  isFocal: z.boolean(),
  ringRadius: z.number().nonnegative().optional(),
  label: z.string().optional(),
  shortLabel: z.string().optional(),
  category: graphNodeCategorySchema.optional(),
  subtitle: z.string().optional(),
  degree: z.number().int().nonnegative().optional(),
  recordId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  filterHref: z.string().nullable().optional(),
  index: z.number().int().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  vx: z.number().optional(),
  vy: z.number().optional(),
  fx: z.number().nullable().optional(),
  fy: z.number().nullable().optional(),
});

export type D3SimulationNode = z.infer<typeof d3SimulationNodeSchema>;

export const d3SimulationLinkSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relation: graphEdgeRelationSchema.optional(),
  source: z.union([z.string().min(1), d3SimulationNodeSchema]),
  target: z.union([z.string().min(1), d3SimulationNodeSchema]),
  index: z.number().int().optional(),
});

export type D3SimulationLink = z.infer<typeof d3SimulationLinkSchema>;

export const connectionsGraphViewPropsSchema = z.object({
  records: z.array(graphRecordInputSchema).readonly(),
  focalRecordId: z.string().uuid().nullable().optional(),
  compact: z.boolean().optional(),
  onSelectFocalRecord: z
    .function({ input: [z.string().uuid().nullable()], output: z.void() })
    .optional(),
});

export type ConnectionsGraphViewProps = z.infer<
  typeof connectionsGraphViewPropsSchema
>;

export const catalogResultsViewPropsSchema = z.object({
  records: z.array(catalogRecordSchema),
  totalMatchingCount: z.number().int().nonnegative(),
  currentPage: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  apiHref: z.string().min(1),
  previousPageHref: z.string().nullable(),
  nextPageHref: z.string().nullable(),
});

export type CatalogResultsViewProps = z.infer<typeof catalogResultsViewPropsSchema>;
