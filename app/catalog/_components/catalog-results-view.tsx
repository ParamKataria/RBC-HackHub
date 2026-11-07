"use client";

import Link from "next/link";
import { useState } from "react";

import { ConnectionsGraphView } from "@/app/catalog/_components/connections-graph";
import styles from "@/app/catalog/_components/catalog-results.module.css";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 text-sm">
        <p className="text-foreground">
          {totalMatchingCount.toLocaleString()} matching records
          {" · "}
          <span className="text-foreground/70">
            Page {currentPage} of {pageCount}
            {" · "}
            <a
              href={apiHref}
              className="text-primary underline-offset-4 hover:underline"
            >
              Open this search
            </a>
          </span>
        </p>

        <div
          role="group"
          aria-label="Catalog results display mode"
          className="inline-flex items-center rounded-full border border-border bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => {
              setViewMode("list");
              setFocalRecordId(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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
        <div className="flex flex-col gap-3">
          {records.map((record) => (
            <article key={record.id} className={`${styles.record} px-6 py-5`}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1">
                <h2 className="min-w-0 font-serif text-2xl font-medium leading-tight">
                  <Link href={`/catalog/${record.id}`} className="hover:text-primary">
                    {record.dc_title}
                  </Link>
                </h2>
                <p className="whitespace-nowrap text-right text-sm text-foreground/70">
                  {connectionsGraph.recordDateLabel(record)}
                </p>
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                {record.dc_publisher}
                {" · "}
                {record.dc_type}
                {" · "}
                {record.bccns_digitized ? "Digitized" : "Not digitized"}
                {record.bccns_access_status ? ` · ${record.bccns_access_status}` : ""}
              </p>
              {record.dc_description ? (
                <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-relaxed text-foreground">
                  {record.dc_description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <a
                  href={record.dc_identifier}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Source
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`${styles.pageLink} shadow-none`}
                  onClick={() => {
                    setFocalRecordId(record.id);
                    setViewMode("graph");
                  }}
                >
                  View Connections
                </Button>
              </div>
            </article>
          ))}
          {records.length === 0 ? (
            <p className={`${styles.empty} px-6 py-8 text-sm text-foreground/70`}>
              No records match this search.
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          {previousPageHref ? (
            <Button variant="outline" className={`${styles.pageLink} shadow-none`} asChild>
              <Link href={previousPageHref}>Previous</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-center text-sm text-foreground/70">
          Page {currentPage} of {pageCount}
        </p>
        <div className="justify-self-end">
          {nextPageHref ? (
            <Button variant="outline" className={`${styles.pageLink} shadow-none`} asChild>
              <Link href={nextPageHref}>Next</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
