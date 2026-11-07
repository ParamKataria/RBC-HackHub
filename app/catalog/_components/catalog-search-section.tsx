"use client";

import { useState } from "react";

import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import { ArchiveSearchBar } from "@/src/components/archive";
import {
  catalogSearchSectionPropsSchema,
  countActiveSecondaryFilters,
  type CatalogSearchSectionProps,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogSearchSection, ArchiveSearchBar, CatalogFilters, filterPanelOpen, integratedFilterCoordinator, activeFilterCount
 * WHAT: Interactive client coordinator component managing dual-mode search and collapsible facet filter panel visibility.
 * WHY: Unites query composition and facet refinement into a single contiguous module sitting directly above catalog totals.
 * WHERE: Rendered on the /catalog route via app/catalog/_components/catalog-results.tsx.
 */
export function CatalogSearchSection(rawProps: CatalogSearchSectionProps) {
  const { publishers, filters } =
    catalogSearchSectionPropsSchema.parse(rawProps);
  const [filterOpen, setFilterOpen] = useState(false);

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
        onToggleFilterPanel={() => setFilterOpen((prev) => !prev)}
      />

      <CatalogFilters
        publishers={publishers}
        query={filters}
        isOpen={filterOpen}
        hideHeaderToggle={true}
        onToggle={() => setFilterOpen((prev) => !prev)}
      />
    </div>
  );
}
