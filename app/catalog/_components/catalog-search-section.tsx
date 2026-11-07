"use client";

import { useEffect, useState } from "react";

import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import { ArchiveSearchBar } from "@/src/components/archive";
import {
  catalogSearchSectionPropsSchema,
  countActiveSecondaryFilters,
  type CatalogSearchSectionProps,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogSearchSection, ArchiveSearchBar, CatalogFilters, filterPanelOpen, integratedFilterCoordinator, activeFilterCount, draftKeyword
 * WHAT: Interactive client coordinator component managing dual-mode search, drafted query synchronization, and collapsible facet filter panel visibility.
 * WHY: Unites query composition and facet refinement into a single contiguous module sitting directly above catalog totals.
 * WHERE: Rendered on the /catalog route via app/catalog/_components/catalog-results.tsx.
 */
export function CatalogSearchSection(rawProps: CatalogSearchSectionProps) {
  const { publishers, filters } =
    catalogSearchSectionPropsSchema.parse(rawProps);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState(filters.q ?? "");

  useEffect(() => {
    setDraftQuery(filters.q ?? "");
  }, [filters.q]);

  /**
   * SOURCE OF TRUTH KEYWORDS: handleToggleFilterPanel, filterPanelOpen, setFilterOpen, catalogFilterToggle, filterPillExpansion
   * WHAT: Toggles the open/collapsed state of the facet filters panel.
   * WHY: Responds to filter pill clicks in ArchiveSearchBar.
   * WHERE: app/catalog/_components/catalog-search-section.tsx.
   */
  const handleToggleFilterPanel = () => setFilterOpen((prev) => !prev);

  /**
   * SOURCE OF TRUTH KEYWORDS: handleCloseFilterPanel, deterministicFilterCollapse, aiModeCollapse, setFilterOpen, filterCoordinator
   * WHAT: Deterministically closes the facet filters panel without toggling.
   * WHY: Ensures switching to AI inquiry mode safely collapses the panel without risking accidental re-opening.
   * WHERE: app/catalog/_components/catalog-search-section.tsx.
   */
  const handleCloseFilterPanel = () => setFilterOpen(false);

  const activeFilterCount = countActiveSecondaryFilters(filters);

  return (
    <div className="flex flex-col gap-4">
      <ArchiveSearchBar
        enableModeToggle={true}
        defaultMode="keyword"
        currentFilters={filters}
        autoNavigate={true}
        initialQuestion={filters.q}
        enableFilterPill={true}
        filterPanelOpen={filterOpen}
        activeFilterCount={activeFilterCount}
        onToggleFilterPanel={handleToggleFilterPanel}
        onCloseFilterPanel={handleCloseFilterPanel}
        onQuestionChange={setDraftQuery}
      />

      <CatalogFilters
        publishers={publishers}
        query={filters}
        draftKeyword={draftQuery}
        isOpen={filterOpen}
        hideHeaderToggle={true}
        onToggle={handleToggleFilterPanel}
        onClose={handleCloseFilterPanel}
      />
    </div>
  );
}
