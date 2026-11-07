"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  catalogFiltersPropsSchema,
  recordTypeValues,
  type CatalogFiltersProps,
} from "@/src/types";

const fieldClassName =
  "flex h-10 w-full rounded-full border border-input bg-background px-4 text-sm text-foreground shadow-none transition-colors duration-150 hover:border-primary/60 focus-visible:border-primary motion-reduce:transition-none";

const secondaryFilterKeys = [
  "institution",
  "type",
  "creator",
  "subject",
  "place",
  "from",
  "to",
] as const;

/**
 * SOURCE OF TRUTH KEYWORDS: countActiveSecondaryFilters, secondaryFacetKeys, facetBadgeCounter, filterCounter, queryFilterTally
 * WHAT: Counts how many secondary facet filters are currently populated in the query, excluding keyword query q.
 * WHY: Supplies the active filter count for the accordion toggle badge and conditional Clear filters action.
 * WHERE: app/catalog/_components/catalog-filters.tsx.
 */
function countActiveSecondaryFilters(
  query: CatalogFiltersProps["query"],
): number {
  return secondaryFilterKeys.reduce((count, key) => {
    const value = query[key];
    return typeof value === "string" && value.trim().length > 0
      ? count + 1
      : count;
  }, 0);
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildClearFiltersHref, clearSecondaryFacetsHref, resetFiltersUrl, preserveKeywordUrl, catalogResetLink
 * WHAT: Generates the URL to clear all secondary facet filters while preserving the active keyword query q.
 * WHY: Allows researchers to reset narrowing facet criteria without losing their keyword search context.
 * WHERE: app/catalog/_components/catalog-filters.tsx.
 */
function buildClearFiltersHref(q?: string): string {
  return q && q.trim().length > 0
    ? `/catalog?q=${encodeURIComponent(q.trim())}`
    : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogFilters, collapsibleFacetPanel, activeFiltersBadge, clearFiltersPreservingQ, accessibleDisclosure, hiddenQueryParam
 * WHAT: Client component rendering an accessible, collapsible facet filter panel for refining catalog queries.
 * WHY: Collapses by default to maximize viewport visibility for Catalog Records, showing an active count badge, expand toggle, and filter reset.
 * WHERE: Rendered on the /catalog route via app/catalog/_components/catalog-results.tsx.
 */
export function CatalogFilters(rawProps: CatalogFiltersProps) {
  const { publishers, query, defaultOpen } =
    catalogFiltersPropsSchema.parse(rawProps);
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  const activeSecondaryCount = countActiveSecondaryFilters(query);
  const clearFiltersHref = buildClearFiltersHref(query.q);
  const filterButtonLabel =
    activeSecondaryCount > 0
      ? `Filters (${activeSecondaryCount})`
      : "Filters";

  return (
    <form
      action="/catalog"
      className="rounded-[20px] border border-border bg-card p-4 transition-all duration-200 sm:p-6"
    >
      <input type="hidden" name="q" defaultValue={query.q ?? ""} />

      {/* Header Bar: Collapsible Toggle Button and Clear Filters Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="catalog-filters-panel"
          aria-label={filterButtonLabel}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <SlidersHorizontal className="h-4 w-4 text-foreground/70" aria-hidden="true" />
          <span>Filters</span>
          {activeSecondaryCount > 0 && (
            <span
              data-testid="catalog-filters-badge"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
            >
              {activeSecondaryCount}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-foreground/70 transition-transform duration-150" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-foreground/70 transition-transform duration-150" aria-hidden="true" />
          )}
        </button>

        {activeSecondaryCount > 0 && (
          <Link
            href={clearFiltersHref}
            className="text-xs font-medium text-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filters
          </Link>
        )}
      </div>

      {/* Collapsible Fields Panel */}
      <div
        id="catalog-filters-panel"
        hidden={!isOpen}
        className={
          isOpen
            ? "mt-4 grid grid-cols-1 items-end gap-x-4 gap-y-4 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-6"
            : "hidden"
        }
      >
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-3">
          Institution
          <select
            name="institution"
            defaultValue={query.institution ?? ""}
            className={fieldClassName}
          >
            <option value="">All institutions</option>
            {publishers.map((publisher) => (
              <option key={publisher} value={publisher}>
                {publisher}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-3">
          Type
          <select
            name="type"
            defaultValue={query.type ?? ""}
            className={fieldClassName}
          >
            <option value="">All types</option>
            {recordTypeValues.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
          Creator
          <Input
            name="creator"
            defaultValue={query.creator ?? ""}
            placeholder="Creator or contributor"
            className={fieldClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
          Subject
          <Input
            name="subject"
            defaultValue={query.subject ?? ""}
            placeholder="Subject"
            className={fieldClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
          Place
          <Input
            name="place"
            defaultValue={query.place ?? ""}
            placeholder="Place"
            className={fieldClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
          From
          <Input
            name="from"
            type="text"
            inputMode="numeric"
            placeholder="YYYY or YYYY-MM-DD"
            defaultValue={query.from ?? ""}
            className={fieldClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
          To
          <Input
            name="to"
            type="text"
            inputMode="numeric"
            placeholder="YYYY or YYYY-MM-DD"
            defaultValue={query.to ?? ""}
            className={fieldClassName}
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-2">
          <Button
            type="submit"
            className="h-10 w-full rounded-full shadow-none transition-colors duration-150 motion-reduce:transition-none"
          >
            Search
          </Button>
          {activeSecondaryCount > 0 && (
            <Link
              href={clearFiltersHref}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Clear filters
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
