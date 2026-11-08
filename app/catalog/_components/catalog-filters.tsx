"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  catalogFiltersPropsSchema,
  countActiveSecondaryFilters,
  recordTypeValues,
  type CatalogFiltersProps,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: fieldClassName, filterInputStyle, roundedPillInput, themeBorderTokens, responsiveFilterField
 * WHAT: Standard Tailwind utility classes applied across all filter form inputs and select elements.
 * WHY: Enforces uniform styling, rounded pill geometry, theme color tokens, and reduced-motion compliance.
 * WHERE: app/catalog/_components/catalog-filters.tsx.
 */
const fieldClassName =
  "flex h-10 w-full rounded-full border border-input bg-background px-4 text-sm text-foreground shadow-none transition-colors duration-150 hover:border-primary/60 focus-visible:border-primary motion-reduce:transition-none";

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
 * SOURCE OF TRUTH KEYWORDS: ClearFiltersLink, clearFiltersHref, resetFiltersButton, secondaryFilterReset, catalogFacetReset
 * WHAT: Reusable action link resetting secondary facet filters while preserving the active keyword query q.
 * WHY: De-duplicates the filter reset markup across the header bar and expanded panel footer.
 * WHERE: app/catalog/_components/catalog-filters.tsx.
 */
function ClearFiltersLink({
  href,
  variant = "header",
}: {
  href: string;
  variant?: "header" | "button";
}) {
  const linkClassName =
    variant === "header"
      ? "text-xs font-medium text-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

  return (
    <Link href={href} className={linkClassName}>
      Clear filters
    </Link>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogFilters, collapsibleFacetPanel, activeFiltersBadge, clearFiltersPreservingQ, accessibleDisclosure, hiddenQueryParam, hideHeaderToggle
 * WHAT: Client component rendering an accessible, collapsible facet filter panel for refining catalog queries.
 * WHY: Collapses by default to maximize viewport visibility for Catalog Records, showing an active count badge, expand toggle, and filter reset.
 * WHERE: Rendered on the /catalog route via app/catalog/_components/catalog-search-section.tsx and catalog-results.tsx.
 */
export function CatalogFilters(rawProps: CatalogFiltersProps) {
  const {
    publishers,
    query,
    defaultOpen,
    isOpen: controlledIsOpen,
    hideHeaderToggle = false,
    draftKeyword,
    onToggle,
  } = catalogFiltersPropsSchema.parse(rawProps);
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(
    defaultOpen ?? false,
  );
  const isOpen =
    controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  /**
   * SOURCE OF TRUTH KEYWORDS: formValues, syncFilterInputs, controlledFacetFields, catalogFilterSync, handleFieldChange
   * WHAT: Internal state for facet filter fields synchronized reactively with incoming URL query props.
   * WHY: Fixes the desynchronization bug where external filter triggers (e.g. Connection Graph, Ask AI, Clear filters) update the URL and badge count but leave dropdowns and text inputs displaying stale values.
   * WHERE: app/catalog/_components/catalog-filters.tsx.
   */
  const [formValues, setFormValues] = useState({
    institution: query.institution ?? "",
    type: query.type ?? "",
    creator: query.creator ?? "",
    subject: query.subject ?? "",
    place: query.place ?? "",
    from: query.from ?? "",
    to: query.to ?? "",
  });

  useEffect(() => {
    setFormValues({
      institution: query.institution ?? "",
      type: query.type ?? "",
      creator: query.creator ?? "",
      subject: query.subject ?? "",
      place: query.place ?? "",
      from: query.from ?? "",
      to: query.to ?? "",
    });
  }, [
    query.institution,
    query.type,
    query.creator,
    query.subject,
    query.place,
    query.from,
    query.to,
  ]);

  /**
   * SOURCE OF TRUTH KEYWORDS: handleFieldChange, updateFilterField, controlledFormState, facetInputUpdate, CatalogFilters
   * WHAT: Updates a single field in the internal facet filter form state.
   * WHY: Keeps controlled inputs responsive to visitor edits while maintaining synchronization with external triggers.
   * WHERE: app/catalog/_components/catalog-filters.tsx input onChange handlers.
   */
  const handleFieldChange = (
    field: keyof typeof formValues,
    value: string,
  ) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: toggleOpen, controlledFilterExpansion, panelVisibility, disclosureToggle, CatalogFilters
   * WHAT: Handles opening and collapsing the facet filters panel, supporting both uncontrolled local state and controlled parent coordination.
   * WHY: Enables standalone disclosure clicks while forwarding toggle events cleanly to parent coordinators like CatalogSearchSection.
   * WHERE: app/catalog/_components/catalog-filters.tsx.
   */
  const toggleOpen = () => {
    if (controlledIsOpen === undefined) {
      setUncontrolledIsOpen((prev) => !prev);
    }
    onToggle?.();
  };

  const activeSecondaryCount = countActiveSecondaryFilters(query);
  const clearFiltersHref = buildClearFiltersHref(query.q);
  const filterButtonLabel =
    activeSecondaryCount > 0
      ? `Filters (${activeSecondaryCount})`
      : "Filters";

  const activePanelClassName =
    "rounded-[20px] border border-border bg-card p-4 transition-all duration-200 sm:p-6";
  const collapsedHiddenHeaderClassName =
    "pointer-events-none border-transparent bg-transparent p-0 transition-all duration-200";

  const formClassName =
    hideHeaderToggle && !isOpen
      ? collapsedHiddenHeaderClassName
      : activePanelClassName;

  return (
    <form action="/catalog" className={formClassName}>
      <input type="hidden" name="q" value={draftKeyword ?? query.q ?? ""} />

      {/* Header Bar: Collapsible Toggle Button and Clear Filters Action */}
      {!hideHeaderToggle && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={isOpen}
            aria-controls="catalog-filters-panel"
            aria-label={filterButtonLabel}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <SlidersHorizontal
              className="h-4 w-4 text-foreground/70"
              aria-hidden="true"
            />
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
              <ChevronUp
                className="h-4 w-4 text-foreground/70 transition-transform duration-150"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="h-4 w-4 text-foreground/70 transition-transform duration-150"
                aria-hidden="true"
              />
            )}
          </button>

          {activeSecondaryCount > 0 && (
            <ClearFiltersLink href={clearFiltersHref} variant="header" />
          )}
        </div>
      )}

      {/* Collapsible Fields Panel with Smooth Grid Accordion Transition */}
      <div
        id="catalog-filters-panel"
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`${
              hideHeaderToggle ? "" : "mt-4 border-t border-border/60 pt-4 "
            }grid grid-cols-1 items-end gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-6`}
          >
            <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-3">
              Institution
              <select
                name="institution"
                value={formValues.institution}
                onChange={(event) =>
                  handleFieldChange("institution", event.target.value)
                }
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
                value={formValues.type}
                onChange={(event) =>
                  handleFieldChange("type", event.target.value)
                }
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
                value={formValues.creator}
                onChange={(event) =>
                  handleFieldChange("creator", event.target.value)
                }
                placeholder="Creator or contributor"
                className={fieldClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
              Subject
              <Input
                name="subject"
                value={formValues.subject}
                onChange={(event) =>
                  handleFieldChange("subject", event.target.value)
                }
                placeholder="Subject"
                className={fieldClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
              Place
              <Input
                name="place"
                value={formValues.place}
                onChange={(event) =>
                  handleFieldChange("place", event.target.value)
                }
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
                value={formValues.from}
                onChange={(event) =>
                  handleFieldChange("from", event.target.value)
                }
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
                value={formValues.to}
                onChange={(event) =>
                  handleFieldChange("to", event.target.value)
                }
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
                <ClearFiltersLink href={clearFiltersHref} variant="button" />
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
