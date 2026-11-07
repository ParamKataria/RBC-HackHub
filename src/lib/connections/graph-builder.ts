import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
} from "d3-force";

import {
  connectionsGraphOptionsSchema,
  connectionsGraphSchema,
  type ActiveGraphRecordsSelection,
  type CatalogRecordDetail,
  type ConnectionsGraph,
  type ConnectionsGraphOptions,
  type D3SimulationLink,
  type D3SimulationNode,
  type ExtractedGraphEntity,
  type GraphEdge,
  type GraphEdgeRelation,
  type GraphEntityCategory,
  type GraphEntityFilterParam,
  type GraphEntityOccurrence,
  type GraphNode,
  type GraphPoint,
  type GraphRecordInput,
  type ScoredGraphRecord,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: buildConnectionsGraph, createD3GraphSimulation, clampGraphCoordinate, GraphNode, GraphEdge, recordDateLabel
 * WHAT: Database-driven graph builder that extracts entities and computes equilibrium positions using d3-force.
 * WHY: Centralizes d3-force physics (forceLink, forceManyBody, forceCenter, forceRadial, forceCollide) and coordinate clamping for both layout calculation and interactive drag.
 * WHERE: app/catalog/_components/connections-graph.tsx, app/catalog/_components/catalog-results-view.tsx, and app/catalog/[id]/page.tsx.
 */

export const GRAPH_CANVAS_WIDTH = 880;
export const GRAPH_CANVAS_HEIGHT = 520;
const CENTER_X = GRAPH_CANVAS_WIDTH / 2;
const CENTER_Y = GRAPH_CANVAS_HEIGHT / 2;
const DEFAULT_MAX_RECORDS = 20;
const MAX_ENTITY_NODES_MULTI_RECORD = 28;

/**
 * SOURCE OF TRUTH KEYWORDS: recordDateLabel, dc_date, date_text, GraphRecordInput, CatalogRecord, archiveDateDisplay
 * WHAT: Returns the ISO dc_date, fallback vague date_text, or default label for a catalog record.
 * WHY: Centralizes date formatting across the connection graph builder and catalog results list cards.
 * WHERE: buildConnectionsGraph in graph-builder.ts and CatalogResultsView in catalog-results-view.tsx.
 */
export function recordDateLabel(record: GraphRecordInput): string {
  return record.dc_date ?? record.date_text ?? "Date not recorded";
}

/**
 * SOURCE OF TRUTH KEYWORDS: truncateGraphLabel, shortLabel, SVGNodeLabel, ConnectionsGraph, GraphNode, ellipsisLabel
 * WHAT: Truncates a long title or entity name for compact SVG node labels.
 * WHY: Keeps D3 force graph node labels concise and readable without overlapping adjacent nodes.
 * WHERE: buildConnectionsGraph node construction in graph-builder.ts.
 */
function truncateGraphLabel(label: string, maxLength: number): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * SOURCE OF TRUTH KEYWORDS: splitDelimitedField, dcterms_spatial, dc_creator, pipeDelimiter, extractRecordEntities, metadataTokens
 * WHAT: Splits a pipe- or semicolon-delimited metadata string into clean non-empty tokens.
 * WHY: Dublin Core spatial and creator fields in Postgres often store multiple values separated by '|'.
 * WHERE: extractRecordEntities in graph-builder.ts.
 */
function splitDelimitedField(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[|;]/g)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        part.toLowerCase() !== "unknown" &&
        part.toLowerCase() !== "n/a",
    );
}

/**
 * SOURCE OF TRUTH KEYWORDS: isRecordDetail, CatalogRecordDetail, GraphRecordInput, record_people, record_places, record_communities
 * WHAT: Type guard checking whether a GraphRecordInput includes relational join arrays.
 * WHY: Detail page records carry record_people, record_places, record_communities, and record_subjects.
 * WHERE: extractRecordEntities in graph-builder.ts.
 */
function isRecordDetail(
  record: GraphRecordInput,
): record is CatalogRecordDetail {
  return "record_people" in record;
}

/**
 * SOURCE OF TRUTH KEYWORDS: entityNodeRadius, GraphEntityCategory, nodeRadius, degreeScaling, d3CollideRadius, buildConnectionsGraph
 * WHAT: Computes the visual and collision circle radius for an extracted entity node based on its category and degree.
 * WHY: Holding institutions and multi-record shared entities render larger than single-record leaf entities.
 * WHERE: Simulation node setup and final GraphNode construction in buildConnectionsGraph.
 */
function entityNodeRadius(
  category: GraphEntityCategory,
  degree: number,
): number {
  if (category === "institution") {
    return 11;
  }
  return degree >= 2 ? 9.5 : 7.5;
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildFilterHref, GraphEntityFilterParam, URLSearchParams, catalogFilterUrl, extractRecordEntities
 * WHAT: Builds a URL-encoded /catalog filter link for a given filter parameter and entity label.
 * WHY: Ensures all entity nodes in the Connection Graph link to valid, URL-encoded catalog filter queries.
 * WHERE: extractRecordEntities in graph-builder.ts.
 */
function buildFilterHref(
  filterParam: GraphEntityFilterParam,
  label: string,
): string {
  const params = new URLSearchParams();
  params.set(filterParam, label);
  return `/catalog?${params.toString()}`;
}

/**
 * SOURCE OF TRUTH KEYWORDS: extractRecordEntities, ExtractedGraphEntity, GraphEntityCategory, bccns_community, dc_subject, dc_creator
 * WHAT: Extracts deduplicated Institution, Person, Place, Community, and Subject entities from one record.
 * WHY: Unifies flat CatalogRecord fields and joined CatalogRecordDetail relations into typed graph entities with working catalog filter URLs while keeping Subject and Community strictly separate.
 * WHERE: selectActiveRecords in graph-builder.ts.
 */
function extractRecordEntities(
  record: GraphRecordInput,
): ExtractedGraphEntity[] {
  const entitiesByKey = new Map<string, ExtractedGraphEntity>();

  const addEntity = (
    rawLabel: string,
    category: GraphEntityCategory,
    relation: GraphEdgeRelation,
    subtitle: string,
    filterParam: GraphEntityFilterParam,
  ): void => {
    const label = rawLabel.trim();
    if (!label) {
      return;
    }
    const normalizedKey = `${category}:${label.toLowerCase()}`;
    if (entitiesByKey.has(normalizedKey)) {
      return;
    }
    entitiesByKey.set(normalizedKey, {
      key: normalizedKey,
      label,
      category,
      relation,
      subtitle,
      filterHref: buildFilterHref(filterParam, label),
    });
  };

  if (record.dc_publisher.trim().length > 0) {
    addEntity(
      record.dc_publisher,
      "institution",
      "held by",
      "Holding Institution",
      "institution",
    );
  }

  if (isRecordDetail(record)) {
    for (const item of record.record_people) {
      addEntity(
        item.people.name,
        "person",
        "creator / contributor",
        `Person (${item.role})`,
        "creator",
      );
    }
  }
  for (const creator of splitDelimitedField(record.dc_creator)) {
    addEntity(
      creator,
      "person",
      "creator / contributor",
      "Person / Creator",
      "creator",
    );
  }

  if (isRecordDetail(record)) {
    for (const item of record.record_places) {
      addEntity(
        item.places.name,
        "place",
        "located in",
        "Geographic Place",
        "place",
      );
    }
  }
  for (const place of splitDelimitedField(record.dcterms_spatial)) {
    addEntity(
      place,
      "place",
      "located in",
      "Geographic Place",
      "place",
    );
  }

  if (isRecordDetail(record)) {
    for (const item of record.record_communities) {
      addEntity(
        item.communities.name,
        "community",
        "community",
        "Community",
        "q",
      );
    }
  }
  for (const comm of record.bccns_community) {
    addEntity(
      comm,
      "community",
      "community",
      "Community",
      "q",
    );
  }

  if (isRecordDetail(record)) {
    for (const item of record.record_subjects) {
      addEntity(
        item.subjects.name,
        "subject",
        "subject",
        "Subject",
        "subject",
      );
    }
  }
  for (const subject of record.dc_subject) {
    addEntity(
      subject,
      "subject",
      "subject",
      "Subject",
      "subject",
    );
  }

  return Array.from(entitiesByKey.values());
}

/**
 * SOURCE OF TRUTH KEYWORDS: selectActiveRecords, ActiveGraphRecordsSelection, focalRecordId, siblingRecords, sharedEntities, buildConnectionsGraph
 * WHAT: Filters and orders the input records when focusing on a specific record or full search results.
 * WHY: Per-record focus highlights the focal record plus sibling records sharing its people, places, communities, or institution.
 * WHERE: buildConnectionsGraph in graph-builder.ts.
 */
function selectActiveRecords(
  records: readonly GraphRecordInput[],
  focalRecordId: string | null,
  maxRecords: number,
): ActiveGraphRecordsSelection {
  const entitiesByRecordId = new Map<string, ExtractedGraphEntity[]>();
  for (const record of records) {
    entitiesByRecordId.set(record.id, extractRecordEntities(record));
  }

  if (!focalRecordId) {
    const sliced = records.slice(0, maxRecords);
    return {
      activeRecords: sliced,
      resolvedFocalId: null,
      entitiesByRecordId,
    };
  }

  const focalRecord = records.find((rec) => rec.id === focalRecordId);
  if (!focalRecord) {
    const sliced = records.slice(0, maxRecords);
    return {
      activeRecords: sliced,
      resolvedFocalId: null,
      entitiesByRecordId,
    };
  }

  const focalEntities = entitiesByRecordId.get(focalRecord.id) ?? [];
  const focalEntityKeys = new Set(focalEntities.map((entity) => entity.key));

  const scoredSiblings: ScoredGraphRecord[] = [];
  for (const candidate of records) {
    if (candidate.id === focalRecord.id) {
      continue;
    }
    const candidateEntities = entitiesByRecordId.get(candidate.id) ?? [];
    let score = 0;
    for (const entity of candidateEntities) {
      if (focalEntityKeys.has(entity.key)) {
        score += entity.category === "institution" ? 1 : 3;
      }
    }
    if (score > 0) {
      scoredSiblings.push({ record: candidate, score });
    }
  }

  scoredSiblings.sort((a, b) => b.score - a.score);
  const siblingLimit = Math.max(0, Math.min(maxRecords - 1, 11));
  const activeRecords = [
    focalRecord,
    ...scoredSiblings.slice(0, siblingLimit).map((item) => item.record),
  ];

  return {
    activeRecords,
    resolvedFocalId: focalRecord.id,
    entitiesByRecordId,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: clampGraphCoordinate, GraphPoint, GRAPH_CANVAS_WIDTH, GRAPH_CANVAS_HEIGHT, viewportBounds, d3ForcePosition
 * WHAT: Clamps a raw (x, y) coordinate pair inside the SVG canvas padding bounds and rounds to 0.1px precision.
 * WHY: Prevents D3 force simulation nodes and labels from clipping outside the SVG viewBox during static layout or live dragging.
 * WHERE: computeD3ForcePositions in graph-builder.ts and tick clamping in ConnectionsGraphView.
 */
export function clampGraphCoordinate(x: number, y: number): GraphPoint {
  const clampedX = Math.max(60, Math.min(GRAPH_CANVAS_WIDTH - 60, x));
  const clampedY = Math.max(44, Math.min(GRAPH_CANVAS_HEIGHT - 44, y));
  return {
    x: Math.round(clampedX * 10) / 10,
    y: Math.round(clampedY * 10) / 10,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: toD3SimulationLinks, GraphEdge, D3SimulationLink, forceLink, computeD3ForcePositions, ConnectionsGraphView
 * WHAT: Maps validated GraphEdge rows into mutable D3SimulationLink objects for d3-force link simulation.
 * WHY: Centralizes GraphEdge-to-D3SimulationLink construction across equilibrium layout and interactive client drag simulation.
 * WHERE: computeD3ForcePositions in graph-builder.ts and ConnectionsGraphView in app/catalog/_components/connections-graph.tsx.
 */
export function toD3SimulationLinks(
  edges: readonly GraphEdge[],
): D3SimulationLink[] {
  return edges.map((edge) => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    relation: edge.relation,
    source: edge.sourceId,
    target: edge.targetId,
  }));
}

/**
 * SOURCE OF TRUTH KEYWORDS: createD3GraphSimulation, forceSimulation, forceLink, forceManyBody, forceRadial, forceCollide
 * WHAT: Creates a configured d3-force Simulation instance with link, charge, center, radial, and collision forces.
 * WHY: Shares the exact physics topology across static equilibrium layout and interactive client d3-drag simulation.
 * WHERE: computeD3ForcePositions in graph-builder.ts and ConnectionsGraphView in app/catalog/_components/connections-graph.tsx.
 */
export function createD3GraphSimulation(
  simNodes: D3SimulationNode[],
  simLinks: D3SimulationLink[],
): Simulation<D3SimulationNode, D3SimulationLink> {
  return forceSimulation<D3SimulationNode, D3SimulationLink>(simNodes)
    .force(
      "link",
      forceLink<D3SimulationNode, D3SimulationLink>(simLinks)
        .id((d) => d.id)
        .distance(95)
        .strength(0.65),
    )
    .force("charge", forceManyBody<D3SimulationNode>().strength(-210))
    .force("center", forceCenter(CENTER_X, CENTER_Y))
    .force(
      "radial",
      forceRadial<D3SimulationNode>(
        (d) => d.ringRadius ?? 155,
        CENTER_X,
        CENTER_Y,
      ).strength(0.55),
    )
    .force(
      "collide",
      forceCollide<D3SimulationNode>((d) => d.radius + 26).iterations(3),
    );
}

/**
 * SOURCE OF TRUTH KEYWORDS: computeD3ForcePositions, createD3GraphSimulation, toD3SimulationLinks, clampGraphCoordinate, D3SimulationNode, GraphPoint
 * WHAT: Runs the shared d3-force simulation for 180 ticks to compute non-overlapping equilibrium node positions.
 * WHY: Uses the d3-force library instead of manual coordinate math so nodes settle naturally by link topology and collision radius.
 * WHERE: buildConnectionsGraph in graph-builder.ts.
 */
function computeD3ForcePositions(
  simNodes: D3SimulationNode[],
  edges: readonly GraphEdge[],
): Map<string, GraphPoint> {
  const simLinks = toD3SimulationLinks(edges);

  const simulation = createD3GraphSimulation(simNodes, simLinks).stop();
  simulation.tick(180);

  const positions = new Map<string, GraphPoint>();
  for (const node of simNodes) {
    positions.set(
      node.id,
      clampGraphCoordinate(node.x ?? CENTER_X, node.y ?? CENTER_Y),
    );
  }

  return positions;
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildConnectionsGraph, ConnectionsGraph, d3ForceSimulation, GraphNode, GraphEdge,ConnectionsGraphOptions
 * WHAT: Builds a validated ConnectionsGraph from an array of CatalogRecord or CatalogRecordDetail rows using d3-force.
 * WHY: Provides a single pure seam for both /catalog search graph views and /catalog/[id] record graphs.
 * WHERE: Imported via src/lib/connections barrel in catalog components.
 */
export function buildConnectionsGraph(
  records: readonly GraphRecordInput[],
  rawOptions?: ConnectionsGraphOptions,
): ConnectionsGraph {
  const options = connectionsGraphOptionsSchema.parse(rawOptions ?? {});
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  const requestedFocalId = options.focalRecordId ?? null;

  if (records.length === 0) {
    return connectionsGraphSchema.parse({
      nodes: [],
      edges: [],
      focalRecordId: null,
      totalRecords: 0,
      institutionCount: 0,
      sharedEntityCount: 0,
    });
  }

  const { activeRecords, resolvedFocalId, entitiesByRecordId } =
    selectActiveRecords(records, requestedFocalId, maxRecords);

  const entityOccurrences = new Map<string, GraphEntityOccurrence>();

  for (const record of activeRecords) {
    const entities = entitiesByRecordId.get(record.id) ?? [];
    for (const entity of entities) {
      const existing = entityOccurrences.get(entity.key);
      if (existing) {
        existing.recordIds.add(record.id);
      } else {
        entityOccurrences.set(entity.key, {
          entity,
          recordIds: new Set([record.id]),
        });
      }
    }
  }

  const focalEntityKeys = new Set(
    resolvedFocalId
      ? (entitiesByRecordId.get(resolvedFocalId) ?? []).map((item) => item.key)
      : [],
  );

  const categoryPriority: Record<GraphEntityCategory, number> = {
    institution: 5,
    person: 4,
    place: 3,
    community: 2,
    subject: 1,
  };

  const sortedEntities = Array.from(entityOccurrences.values()).sort((a, b) => {
    const aFocal = focalEntityKeys.has(a.entity.key) ? 1 : 0;
    const bFocal = focalEntityKeys.has(b.entity.key) ? 1 : 0;
    if (aFocal !== bFocal) {
      return bFocal - aFocal;
    }
    if (b.recordIds.size !== a.recordIds.size) {
      return b.recordIds.size - a.recordIds.size;
    }
    const catDiff =
      categoryPriority[b.entity.category] - categoryPriority[a.entity.category];
    if (catDiff !== 0) {
      return catDiff;
    }
    return a.entity.label.localeCompare(b.entity.label);
  });

  const keptEntities =
    activeRecords.length <= 1
      ? sortedEntities
      : sortedEntities.slice(0, MAX_ENTITY_NODES_MULTI_RECORD);
  const keptEntityKeys = new Set(keptEntities.map((item) => item.entity.key));

  const edges: GraphEdge[] = [];
  const degreeByNodeId = new Map<string, number>();

  const incrementDegree = (nodeId: string): void => {
    degreeByNodeId.set(nodeId, (degreeByNodeId.get(nodeId) ?? 0) + 1);
  };

  for (const record of activeRecords) {
    const recordNodeId = `record:${record.id}`;
    const entities = entitiesByRecordId.get(record.id) ?? [];
    for (const entity of entities) {
      if (!keptEntityKeys.has(entity.key)) {
        continue;
      }
      const edgeId = `edge:${recordNodeId}->${entity.key}`;
      edges.push({
        id: edgeId,
        sourceId: recordNodeId,
        targetId: entity.key,
        relation: entity.relation,
      });
      incrementDegree(recordNodeId);
      incrementDegree(entity.key);
    }
  }

  const simNodes: D3SimulationNode[] = [];
  const ringRadiusByNodeId = new Map<string, number>();

  for (const record of activeRecords) {
    const nodeId = `record:${record.id}`;
    const isFocal = record.id === resolvedFocalId;
    const radius = isFocal ? 13 : 9;
    const ringRadius = isFocal ? 0 : resolvedFocalId ? 195 : 155;
    ringRadiusByNodeId.set(nodeId, ringRadius);

    simNodes.push({
      id: nodeId,
      radius,
      isFocal,
      ringRadius,
      fx: isFocal ? CENTER_X : undefined,
      fy: isFocal ? CENTER_Y : undefined,
    });
  }

  for (const { entity, recordIds } of keptEntities) {
    const degree = degreeByNodeId.get(entity.key) ?? recordIds.size;
    const radius = entityNodeRadius(entity.category, degree);
    const ringRadius = resolvedFocalId
      ? focalEntityKeys.has(entity.key)
        ? 125
        : 225
      : degree >= 2
        ? 90
        : 205;
    ringRadiusByNodeId.set(entity.key, ringRadius);

    simNodes.push({
      id: entity.key,
      radius,
      isFocal: false,
      ringRadius,
    });
  }

  const coordsByNodeId = computeD3ForcePositions(simNodes, edges);
  const nodes: GraphNode[] = [];

  for (const record of activeRecords) {
    const nodeId = `record:${record.id}`;
    const coords = coordsByNodeId.get(nodeId) ?? { x: CENTER_X, y: CENTER_Y };
    const degree = degreeByNodeId.get(nodeId) ?? 0;
    const isFocal = record.id === resolvedFocalId;
    const dateLabel = recordDateLabel(record);
    const ringRadius =
      ringRadiusByNodeId.get(nodeId) ??
      (isFocal ? 0 : resolvedFocalId ? 195 : 155);

    nodes.push({
      id: nodeId,
      label: record.dc_title,
      shortLabel: truncateGraphLabel(record.dc_title, isFocal ? 28 : 20),
      category: "record",
      subtitle: `${record.dc_type} · ${dateLabel}`,
      x: coords.x,
      y: coords.y,
      radius: isFocal ? 13 : 9,
      ringRadius,
      degree,
      isFocal,
      recordId: record.id,
      externalUrl: record.dc_identifier,
      filterHref: `/catalog/${record.id}`,
    });
  }

  for (const { entity, recordIds } of keptEntities) {
    const coords = coordsByNodeId.get(entity.key) ?? { x: CENTER_X, y: CENTER_Y };
    const degree = degreeByNodeId.get(entity.key) ?? recordIds.size;
    const baseRadius = entityNodeRadius(entity.category, degree);
    const ringRadius =
      ringRadiusByNodeId.get(entity.key) ?? (degree >= 2 ? 90 : 205);

    nodes.push({
      id: entity.key,
      label: entity.label,
      shortLabel: truncateGraphLabel(entity.label, 22),
      category: entity.category,
      subtitle:
        degree >= 2
          ? `${entity.subtitle} · Shared across ${degree} records`
          : entity.subtitle,
      x: coords.x,
      y: coords.y,
      radius: baseRadius,
      ringRadius,
      degree,
      isFocal: false,
      recordId: null,
      externalUrl: null,
      filterHref: entity.filterHref,
    });
  }

  const institutionCount = keptEntities.filter(
    (item) => item.entity.category === "institution",
  ).length;
  const sharedEntityCount = keptEntities.filter(
    (item) => item.recordIds.size >= 2,
  ).length;

  return connectionsGraphSchema.parse({
    nodes,
    edges,
    focalRecordId: resolvedFocalId,
    totalRecords: activeRecords.length,
    institutionCount,
    sharedEntityCount,
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildConnectionsGraphFromRecords, buildConnectionsGraph, ConnectionsGraph, GraphRecordInput, ConnectionsGraphOptions
 * WHAT: Alias of buildConnectionsGraph for callers and tests importing buildConnectionsGraphFromRecords.
 * WHY: Preserves a consistent seam name across graph-builder consumers.
 * WHERE: Exported from src/lib/connections/graph-builder.ts and src/lib/connections/index.ts.
 */
export const buildConnectionsGraphFromRecords = buildConnectionsGraph;
