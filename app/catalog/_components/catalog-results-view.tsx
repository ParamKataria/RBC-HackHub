"use client";

import Link from "next/link";
import { useState } from "react";

import { ConnectionsGraphView } from "@/app/catalog/_components/connections-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { connectionsGraph } from "@/src/lib/connections";
import {
  catalogResultsViewPropsSchema,
  type CatalogResultsViewProps,
  type CatalogViewMode,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogResultsView, ConnectionsGraphView, CatalogViewMode, focalRecordId, recordDateLabel, ViewConnections
 * WHAT: Client view switcher that toggles catalog search results between the flat List View and the interactive SVG Connection Graph.
 * WHY: Keeps the catalog list-first by default while letting visitors inspect cross-archive connections or focus on one record with zero extra API calls.
 * WHERE: Rendered by CatalogResults in app/catalog/_components/catalog-results.tsx.
 */
export function CatalogResultsView(rawProps: CatalogResultsViewProps) {
  const {
    records,
    totalMatchingCount,
    currentPage,
    pageCount,
    apiHref,
    previousPageHref,
    nextPageHref,
  } = catalogResultsViewPropsSchema.parse(rawProps);

  const [viewMode, setViewMode] = useState<CatalogViewMode>("list");
  const [focalRecordId, setFocalRecordId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {totalMatchingCount.toLocaleString()} matching records · page{" "}
          {currentPage} of {pageCount}
          {" · "}
          <a
            href={apiHref}
            className="text-primary underline-offset-4 hover:underline"
          >
            {apiHref}
          </a>
        </p>

        <div
          role="group"
          aria-label="Catalog results display mode"
          className="inline-flex items-center rounded-sm border border-border bg-background p-0.5"
        >
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => {
              setViewMode("list");
              setFocalRecordId(null);
            }}
            className={`rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted hover:text-primary"
            }`}
          >
            List View
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "graph"}
            onClick={() => setViewMode("graph")}
            className={`rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "graph"
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted hover:text-primary"
            }`}
          >
            View on Connection Graph
          </button>
        </div>
      </div>

      {viewMode === "graph" ? (
        <ConnectionsGraphView
          records={records}
          focalRecordId={focalRecordId}
          onSelectFocalRecord={(recordId) => setFocalRecordId(recordId)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {records.map((record) => (
            <Card key={record.id} className="rounded-sm">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="font-serif text-xl">
                    <Link
                      href={`/catalog/${record.id}`}
                      className="hover:underline"
                    >
                      {record.dc_title}
                    </Link>
                  </CardTitle>
                  <CardDescription>{record.dc_publisher}</CardDescription>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-sm"
                  onClick={() => {
                    setFocalRecordId(record.id);
                    setViewMode("graph");
                  }}
                >
                  View Connections
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-sm">
                    {record.dc_type}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm">
                    {connectionsGraph.recordDateLabel(record)}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm">
                    {record.bccns_digitized ? "Digitized" : "Not digitized"}
                  </Badge>
                  {record.bccns_access_status ? (
                    <Badge variant="outline" className="rounded-sm">
                      {record.bccns_access_status}
                    </Badge>
                  ) : null}
                </div>
                {record.dc_description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {record.dc_description}
                  </p>
                ) : null}
                <a
                  href={record.dc_identifier}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-primary underline-offset-4 hover:underline"
                >
                  {record.dc_identifier}
                </a>
              </CardContent>
            </Card>
          ))}
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No records match this search.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3">
        {previousPageHref ? (
          <Button variant="outline" className="rounded-sm" asChild>
            <Link href={previousPageHref}>Previous</Link>
          </Button>
        ) : null}
        {nextPageHref ? (
          <Button variant="outline" className="rounded-sm" asChild>
            <Link href={nextPageHref}>Next</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
