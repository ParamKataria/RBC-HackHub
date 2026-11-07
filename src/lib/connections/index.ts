/**
 * SOURCE OF TRUTH KEYWORDS: connectionsBarrel, buildConnectionsGraph, createD3GraphSimulation, clampGraphCoordinate, recordDateLabel, connectionsGraph
 * WHAT: Barrel export for the Catalog Connection Graph derivation module.
 * WHY: Keeps imports consistent across catalog server and client components.
 * WHERE: app/catalog/_components/ and app/catalog/[id]/page.tsx.
 */
export {
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_WIDTH,
  buildConnectionsGraph,
  clampGraphCoordinate,
  createD3GraphSimulation,
  recordDateLabel,
} from "./graph-builder";
export * as connectionsGraph from "./graph-builder";
