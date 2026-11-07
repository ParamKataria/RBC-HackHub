"use client";

import { drag } from "d3-drag";
import { select } from "d3-selection";
import { zoom } from "d3-zoom";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { connectionsGraph } from "@/src/lib/connections";
import {
  connectionsGraphViewPropsSchema,
  type ConnectionsGraphViewProps,
  type D3SimulationLink,
  type D3SimulationNode,
  type GraphActiveNeighborhood,
  type GraphCategoryMeta,
  type GraphNeighborItem,
  type GraphNode,
  type GraphNodeCategory,
  type GraphPoint,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CATEGORY_META, GraphNodeCategory, GraphCategoryMeta, ConnectionsGraphView, nodeClass, swatchClass
 * WHAT: Lookup table mapping each GraphNodeCategory to its human-readable archival label, SVG circle class, and legend swatch class.
 * WHY: Eliminates repeated switch statements while color-coding all 5 node categories strictly with theme tokens.
 * WHERE: Legend bar, D3 SVG node join, and details strip in ConnectionsGraphView.
 */
const CATEGORY_META: Record<GraphNodeCategory, GraphCategoryMeta> = {
  record: {
    label: "Archival Record",
    nodeClass: "fill-primary stroke-background",
    swatchClass: "bg-primary border-background",
  },
  institution: {
    label: "Holding Institution",
    nodeClass: "fill-foreground stroke-background",
    swatchClass: "bg-foreground border-background",
  },
  person: {
    label: "Person / Creator",
    nodeClass: "fill-accent stroke-background",
    swatchClass: "bg-accent border-background",
  },
  place: {
    label: "Geographic Place",
    nodeClass: "fill-secondary stroke-primary",
    swatchClass: "bg-secondary border-primary",
  },
  community: {
    label: "Community / Subject",
    nodeClass: "fill-card stroke-accent",
    swatchClass: "bg-card border-accent",
  },
};

const LEGEND_CATEGORIES: readonly GraphNodeCategory[] = [
  "record",
  "institution",
  "person",
  "place",
  "community",
];

/**
 * SOURCE OF TRUTH KEYWORDS: resolveSimulationEndpoint, D3SimulationNode, D3SimulationLink, clampGraphCoordinate, GraphPoint, d3ForceLink
 * WHAT: Resolves a d3-force link endpoint (either a node ID string or a bound D3SimulationNode) to a clamped SVG coordinate.
 * WHY: d3-force mutates link endpoints from string IDs to node objects upon simulation initialization; handling both avoids type casts.
 * WHERE: SVG line coordinate updates in ConnectionsGraphView.
 */
function resolveSimulationEndpoint(
  endpoint: string | D3SimulationNode,
  nodesById: ReadonlyMap<string, D3SimulationNode>,
): GraphPoint {
  if (typeof endpoint === "object") {
    return connectionsGraph.clampGraphCoordinate(
      endpoint.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2,
      endpoint.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2,
    );
  }
  const found = nodesById.get(endpoint);
  return connectionsGraph.clampGraphCoordinate(
    found?.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2,
    found?.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2,
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: ConnectionsGraphView, d3ForceSimulation, d3Zoom, d3Drag, d3SelectAllDataJoin, focalRecordId
 * WHAT: Interactive D3 force-directed SVG network (d3-force, d3-zoom, d3-drag, d3-selection) and details strip for catalog search results and record detail pages.
 * WHY: Uses D3 .selectAll().data().join() DOM binding, pan/zoom, and interactive node dragging to reveal how archival records connect across people, communities, places, and holding institutions.
 * WHERE: app/catalog/_components/catalog-results-view.tsx and app/catalog/[id]/page.tsx.
 */
export function ConnectionsGraphView(rawProps: ConnectionsGraphViewProps) {
  const {
    records,
    focalRecordId = null,
    compact = false,
    onSelectFocalRecord,
  } = connectionsGraphViewPropsSchema.parse(rawProps);

  const graph = useMemo(
    () =>
      connectionsGraph.buildConnectionsGraph(records, {
        focalRecordId: focalRecordId ?? null,
        maxRecords: compact ? 12 : 20,
      }),
    [records, focalRecordId, compact],
  );

  const initialSelectedNodeId = useMemo(() => {
    if (!graph.focalRecordId) {
      return null;
    }
    const focalNode = graph.nodes.find(
      (node) => node.recordId === graph.focalRecordId,
    );
    return focalNode?.id ?? null;
  }, [graph.focalRecordId, graph.nodes]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialSelectedNodeId,
  );
  const [prevFocalRecordId, setPrevFocalRecordId] = useState<string | null>(
    focalRecordId ?? null,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomGroupRef = useRef<SVGGElement | null>(null);
  const linksGroupRef = useRef<SVGGElement | null>(null);
  const nodesGroupRef = useRef<SVGGElement | null>(null);

  if ((focalRecordId ?? null) !== prevFocalRecordId) {
    setPrevFocalRecordId(focalRecordId ?? null);
    setSelectedNodeId(initialSelectedNodeId);
  }

  const resolvedSelectedId = useMemo(() => {
    if (selectedNodeId && graph.nodes.some((node) => node.id === selectedNodeId)) {
      return selectedNodeId;
    }
    return null;
  }, [selectedNodeId, graph.nodes]);

  const activeNodeId = resolvedSelectedId ?? hoveredNodeId;

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of graph.nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [graph.nodes]);

  const activeNode = activeNodeId ? (nodesById.get(activeNodeId) ?? null) : null;

  const { connectedNodeIds, activeNeighbors }: GraphActiveNeighborhood =
    useMemo(() => {
      const neighborIds = new Set<string>();
      const neighbors: GraphNeighborItem[] = [];
      if (!activeNodeId) {
        return { connectedNodeIds: neighborIds, activeNeighbors: neighbors };
      }
      neighborIds.add(activeNodeId);
      for (const edge of graph.edges) {
        if (edge.sourceId === activeNodeId) {
          neighborIds.add(edge.targetId);
          const targetNode = nodesById.get(edge.targetId);
          if (targetNode) {
            neighbors.push({ node: targetNode, relation: edge.relation });
          }
        } else if (edge.targetId === activeNodeId) {
          neighborIds.add(edge.sourceId);
          const sourceNode = nodesById.get(edge.sourceId);
          if (sourceNode) {
            neighbors.push({ node: sourceNode, relation: edge.relation });
          }
        }
      }
      return { connectedNodeIds: neighborIds, activeNeighbors: neighbors };
    }, [activeNodeId, graph.edges, nodesById]);

  // Create and bind SVG edges and nodes with D3 .selectAll().data().join(), attach d3-drag, and run simulation ticks on drag
  useEffect(() => {
    const linksGroupEl = linksGroupRef.current;
    const nodesGroupEl = nodesGroupRef.current;
    if (!linksGroupEl || !nodesGroupEl || graph.nodes.length === 0) {
      return;
    }

    const simNodes: D3SimulationNode[] = graph.nodes.map((node) => ({
      ...node,
      fx: node.isFocal ? connectionsGraph.GRAPH_CANVAS_WIDTH / 2 : undefined,
      fy: node.isFocal ? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2 : undefined,
    }));

    const simNodesById = new Map<string, D3SimulationNode>();
    for (const sn of simNodes) {
      simNodesById.set(sn.id, sn);
    }

    const simLinks: D3SimulationLink[] = graph.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      relation: edge.relation,
      source: edge.sourceId,
      target: edge.targetId,
    }));

    const simulation = connectionsGraph
      .createD3GraphSimulation(simNodes, simLinks)
      .alpha(0)
      .stop();

    const linkSelection = select(linksGroupEl)
      .selectAll<SVGLineElement, D3SimulationLink>("line[data-graph-edge='true']")
      .data(simLinks, (d) => d.id)
      .join("line")
      .attr("data-graph-edge", "true");

    const nodeSelection = select(nodesGroupEl)
      .selectAll<SVGGElement, D3SimulationNode>("g[data-graph-node='true']")
      .data(simNodes, (d) => d.id)
      .join((enter) => {
        const group = enter
          .append("g")
          .attr("data-graph-node", "true")
          .attr("tabindex", 0)
          .attr("role", "button");

        group
          .append("circle")
          .attr("data-node-role", "focus-ring")
          .attr(
            "class",
            "fill-none stroke-ring opacity-0 transition-opacity group-focus-visible:opacity-100",
          )
          .attr("stroke-dasharray", "2 2")
          .attr("stroke-width", 2);

        group
          .append("circle")
          .attr("data-node-role", "selection-ring")
          .attr("class", "fill-none stroke-primary opacity-0")
          .attr("stroke-width", 1.5);

        group
          .append("circle")
          .attr("data-node-role", "body")
          .attr("stroke-width", 2);

        group
          .append("text")
          .attr("data-node-role", "label")
          .attr("text-anchor", "middle");

        return group;
      });

    nodeSelection
      .attr("aria-label", (d) => {
        const category = d.category ?? "record";
        const meta = CATEGORY_META[category];
        return `${meta.label}: ${d.label ?? d.id} (${d.degree ?? 0} connections)`;
      })
      .on("click", (event: MouseEvent, d) => {
        if (event.defaultPrevented) {
          return;
        }
        setSelectedNodeId((current) => (current === d.id ? null : d.id));
      })
      .on("mouseenter", (_event: MouseEvent, d) => {
        setHoveredNodeId(d.id);
      })
      .on("mouseleave", () => {
        setHoveredNodeId(null);
      })
      .on("keydown", (event: KeyboardEvent, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedNodeId((current) => (current === d.id ? null : d.id));
        }
      });

    nodeSelection
      .select<SVGCircleElement>("circle[data-node-role='focus-ring']")
      .attr("r", (d) => d.radius + 7);

    nodeSelection
      .select<SVGCircleElement>("circle[data-node-role='selection-ring']")
      .attr("r", (d) => d.radius + 4);

    nodeSelection
      .select<SVGCircleElement>("circle[data-node-role='body']")
      .attr("r", (d) => d.radius)
      .attr("class", (d) => CATEGORY_META[d.category ?? "record"].nodeClass);

    nodeSelection
      .select<SVGTextElement>("text[data-node-role='label']")
      .text((d) => d.shortLabel ?? d.label ?? d.id);

    const syncPositions = (): void => {
      for (const item of simNodes) {
        const clamped = connectionsGraph.clampGraphCoordinate(
          item.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2,
          item.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2,
        );
        item.x = clamped.x;
        item.y = clamped.y;
      }

      linkSelection
        .attr("x1", (d) => resolveSimulationEndpoint(d.source, simNodesById).x)
        .attr("y1", (d) => resolveSimulationEndpoint(d.source, simNodesById).y)
        .attr("x2", (d) => resolveSimulationEndpoint(d.target, simNodesById).x)
        .attr("y2", (d) => resolveSimulationEndpoint(d.target, simNodesById).y);

      nodeSelection
        .select<SVGCircleElement>("circle[data-node-role='focus-ring']")
        .attr("cx", (d) => d.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2)
        .attr("cy", (d) => d.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2);

      nodeSelection
        .select<SVGCircleElement>("circle[data-node-role='selection-ring']")
        .attr("cx", (d) => d.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2)
        .attr("cy", (d) => d.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2);

      nodeSelection
        .select<SVGCircleElement>("circle[data-node-role='body']")
        .attr("cx", (d) => d.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2)
        .attr("cy", (d) => d.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2);

      nodeSelection
        .select<SVGTextElement>("text[data-node-role='label']")
        .attr("x", (d) => d.x ?? connectionsGraph.GRAPH_CANVAS_WIDTH / 2)
        .attr("y", (d) => {
          const cy = d.y ?? connectionsGraph.GRAPH_CANVAS_HEIGHT / 2;
          const labelAbove = cy < connectionsGraph.GRAPH_CANVAS_HEIGHT / 2;
          return cy + (labelAbove ? -(d.radius + 7) : d.radius + 13);
        });
    };

    syncPositions();
    simulation.on("tick", syncPositions);

    const dragBehavior = drag<SVGGElement, D3SimulationNode>()
      .clickDistance(4)
      .on("start", (event, d) => {
        if (!event.active) {
          simulation.alphaTarget(0.28).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        const clamped = connectionsGraph.clampGraphCoordinate(event.x, event.y);
        d.fx = clamped.x;
        d.fy = clamped.y;
      })
      .on("end", (event, d) => {
        if (!event.active) {
          simulation.alphaTarget(0);
        }
        if (!d.isFocal) {
          d.fx = undefined;
          d.fy = undefined;
        }
      });

    nodeSelection.call(dragBehavior);

    return () => {
      simulation.stop();
      nodeSelection.on(".drag", null);
    };
  }, [graph]);

  // Synchronize D3-bound edge and node highlight styles when selection or hover changes
  useEffect(() => {
    const linksGroupEl = linksGroupRef.current;
    const nodesGroupEl = nodesGroupRef.current;
    if (!linksGroupEl || !nodesGroupEl || graph.nodes.length === 0) {
      return;
    }

    select(linksGroupEl)
      .selectAll<SVGLineElement, D3SimulationLink>("line[data-graph-edge='true']")
      .attr("class", (d) => {
        const isHighlighted =
          activeNodeId === d.sourceId || activeNodeId === d.targetId;
        if (isHighlighted) {
          return "stroke-primary transition-opacity duration-150";
        }
        return activeNodeId
          ? "stroke-border opacity-25 transition-opacity duration-150"
          : "stroke-border opacity-90 transition-opacity duration-150";
      })
      .attr("stroke-width", (d) =>
        activeNodeId === d.sourceId || activeNodeId === d.targetId ? 1.8 : 1,
      );

    const nodeGroups = select(nodesGroupEl).selectAll<
      SVGGElement,
      D3SimulationNode
    >("g[data-graph-node='true']");

    nodeGroups
      .attr("aria-pressed", (d) =>
        resolvedSelectedId === d.id ? "true" : "false",
      )
      .attr("class", (d) => {
        const isDimmed = Boolean(activeNodeId && !connectedNodeIds.has(d.id));
        return `group cursor-pointer transition-opacity duration-150 focus:outline-none ${
          isDimmed ? "opacity-25" : "opacity-100"
        }`;
      });

    nodeGroups
      .select<SVGCircleElement>("circle[data-node-role='selection-ring']")
      .attr("class", (d) =>
        activeNodeId === d.id || d.isFocal
          ? "fill-none stroke-primary opacity-100"
          : "fill-none stroke-primary opacity-0",
      );

    nodeGroups
      .select<SVGTextElement>("text[data-node-role='label']")
      .attr("class", (d) =>
        activeNodeId === d.id || d.isFocal
          ? "fill-foreground font-serif text-[11px] font-semibold"
          : "fill-foreground font-sans text-[10px]",
      );
  }, [graph, activeNodeId, resolvedSelectedId, connectedNodeIds]);

  // Attach d3-zoom for smooth pan & zoom on the SVG canvas
  useEffect(() => {
    const svgEl = svgRef.current;
    const zoomGroupEl = zoomGroupRef.current;
    if (!svgEl || !zoomGroupEl) {
      return;
    }

    const zoomBehavior = zoom<SVGSVGElement, undefined>()
      .scaleExtent([0.55, 2.75])
      .filter((event: Event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-graph-node='true']")
        ) {
          return event.type === "wheel";
        }
        return true;
      })
      .on("zoom", (event) => {
        const { x, y, k } = event.transform;
        select(zoomGroupEl).attr(
          "transform",
          `translate(${x}, ${y}) scale(${k})`,
        );
      });

    const selection = select<SVGSVGElement, undefined>(svgEl);
    selection.call(zoomBehavior);

    return () => {
      selection.on(".zoom", null);
    };
  }, [graph.nodes.length]);

  if (graph.nodes.length === 0) {
    return (
      <div
        className={`rounded-sm border border-border bg-card ${compact ? "p-4" : "p-6"} text-sm text-muted-foreground`}
      >
        No records available to build a connection graph for this query.
      </div>
    );
  }

  const focalRecordNode = graph.focalRecordId
    ? (graph.nodes.find((node) => node.recordId === graph.focalRecordId) ?? null)
    : null;

  return (
    <section
      aria-label="Catalog Connection Graph"
      className={`flex flex-col rounded-sm border border-border bg-card ${
        compact ? "gap-3 p-4" : "gap-4 p-6"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {focalRecordNode ? "Focused Record Network" : "Cross-Archive Connection Graph"}
          </p>
          <h2
            className={`mt-1 font-serif font-semibold text-card-foreground ${
              compact ? "text-lg" : "text-2xl"
            }`}
          >
            {focalRecordNode
              ? focalRecordNode.label
              : "Shared People, Communities, Places & Holding Institutions"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {graph.totalRecords} {graph.totalRecords === 1 ? "record" : "records"} ·{" "}
            {graph.institutionCount}{" "}
            {graph.institutionCount === 1
              ? "holding institution"
              : "holding institutions"}{" "}
            · {graph.sharedEntityCount} shared cross-record{" "}
            {graph.sharedEntityCount === 1 ? "connection" : "connections"}
          </p>
        </div>

        {focalRecordId && onSelectFocalRecord ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => {
                onSelectFocalRecord(null);
                setSelectedNodeId(null);
              }}
            >
              Show All Search Connections
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {LEGEND_CATEGORIES.map((category) => (
          <div key={category} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-sm border ${CATEGORY_META[category].swatchClass}`}
            />
            <span>{CATEGORY_META[category].label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Drag nodes, scroll to zoom, or click any node to inspect connections
        </span>
      </div>

      <div className="overflow-hidden rounded-sm border border-border bg-background">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${connectionsGraph.GRAPH_CANVAS_WIDTH} ${connectionsGraph.GRAPH_CANVAS_HEIGHT}`}
          role="img"
          aria-label="Interactive D3 force-directed network of archival records, holding institutions, people, places, and communities"
          className={`h-auto w-full cursor-grab select-none active:cursor-grabbing ${
            compact ? "max-h-[340px]" : "min-w-[640px]"
          }`}
        >
          <g ref={zoomGroupRef} transform="translate(0, 0) scale(1)">
            <g ref={linksGroupRef} />
            <g ref={nodesGroupRef} />
          </g>
        </svg>
      </div>

      {activeNode ? (
        <div
          aria-live="polite"
          className={`flex flex-col gap-3 rounded-sm border border-border bg-background ${
            compact ? "p-3" : "p-4"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm border border-border bg-card px-2 py-0.5 text-xs font-medium text-card-foreground">
                  {CATEGORY_META[activeNode.category].label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {activeNode.subtitle}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {activeNeighbors.length}{" "}
                  {activeNeighbors.length === 1
                    ? "connected node"
                    : "connected nodes"}
                </span>
              </div>
              <h3
                className={`mt-1.5 font-serif font-semibold text-foreground ${
                  compact ? "text-base" : "text-xl"
                }`}
              >
                {activeNode.label}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeNode.category === "record" && activeNode.recordId ? (
                <>
                  <Button asChild size="sm" className="rounded-sm">
                    <Link href={`/catalog/${activeNode.recordId}`}>
                      Open Record Detail
                    </Link>
                  </Button>
                  {activeNode.externalUrl ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-sm"
                    >
                      <a
                        href={activeNode.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Source Archive
                      </a>
                    </Button>
                  ) : null}
                </>
              ) : null}

              {activeNode.category !== "record" && activeNode.filterHref ? (
                <Button asChild size="sm" className="rounded-sm">
                  <Link href={activeNode.filterHref}>
                    Filter Catalog by {CATEGORY_META[activeNode.category].label}
                  </Link>
                </Button>
              ) : null}

              {resolvedSelectedId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-sm"
                  onClick={() => setSelectedNodeId(null)}
                >
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>

          {activeNeighbors.length > 0 ? (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Direct Connections ({activeNeighbors.length})
              </p>
              <ul className="flex flex-wrap gap-2">
                {activeNeighbors.map(({ node: neighbor, relation }) => (
                  <li
                    key={`${neighbor.id}-${relation}`}
                    className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1 text-xs text-card-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2.5 w-2.5 rounded-sm border ${CATEGORY_META[neighbor.category].swatchClass}`}
                    />
                    <span className="font-medium">{neighbor.shortLabel}</span>
                    <span className="text-muted-foreground">({relation})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
