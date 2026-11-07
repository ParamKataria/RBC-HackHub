import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import { CatalogResultsView } from "@/app/catalog/_components/catalog-results-view";
import styles from "@/app/catalog/_components/catalog-results.module.css";
import { catalogService, searchService } from "@/lib/services";
import { ArchiveSearchBar } from "@/src/components/archive";
import {
  catalogSearchParamsInputSchema,
  firstSearchValue,
  parseSearchParams,
  type CatalogPageProps,
  type SearchQuery,
} from "@/src/types";
import { ZodError } from "zod";

const PAGE_SIZE = 20;

/**
 * SOURCE OF TRUTH KEYWORDS: searchParamsToUrl, SearchQuery, URLSearchParams, /api/search, page, catalogFilters
 * WHAT: Turns the catalog query into a URL query string.
 * WHY: Pagination and the JSON route must keep the same full-text filters.
 * WHERE: Catalog result links.
 */
function searchParamsToUrl(filters: SearchQuery, page?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  if (page && page > 1) {
    params.set("page", String(page));
  }
  return params.toString();
}

/**
 * SOURCE OF TRUTH KEYWORDS: catalogPageHref, SearchQuery, searchParamsToUrl, pagination, /catalog, queryString
 * WHAT: Builds a catalog page link for the active full-text filters.
 * WHY: Page 1 with no filters should stay on /catalog.
 * WHERE: Previous and next links.
 */
function catalogPageHref(filters: SearchQuery, page: number): string {
  const query = searchParamsToUrl(filters, page);
  return query ? `/catalog?${query}` : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogResults, CatalogPageProps, CatalogRecord, PostgresTotals, searchParams, CatalogResultsView
 * WHAT: Renders catalog totals, filters, and one page of records with List View and Connection Graph toggle.
 * WHY: Connects the server-side Supabase full-text search results to the interactive catalog list and graph views.
 * WHERE: app/catalog/page.tsx inside Suspense.
 */
export async function CatalogResults({ searchParams }: CatalogPageProps) {
  let filters: SearchQuery;
  let requestedPage = 1;
  try {
    const rawParams = catalogSearchParamsInputSchema.parse(await searchParams);
    const requestParams = new URLSearchParams();
    for (const key of [
      "q",
      "institution",
      "type",
      "creator",
      "subject",
      "place",
      "from",
      "to",
    ] as const) {
      const first = firstSearchValue(rawParams[key]);
      if (first) {
        requestParams.set(key, first);
      }
    }
    const pageText = firstSearchValue(rawParams.page);
    requestedPage = Number.parseInt(pageText, 10);
    filters = parseSearchParams(requestParams);
  } catch (error) {
    const message =
      error instanceof ZodError ? (error.issues[0]?.message ?? "Invalid search") : "Invalid search";
    return (
      <p className="rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {message}
      </p>
    );
  }

  let header;
  let search;
  try {
    [header, search] = await Promise.all([
      catalogService.getCatalogHeader(),
      searchService.searchRecords(filters),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog query failed";
    return (
      <p className="rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {message}
      </p>
    );
  }

  const pageCount = Math.max(1, Math.ceil(search.count / PAGE_SIZE));
  const page = Math.min(
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageCount,
  );
  const records = search.results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const apiQuery = searchParamsToUrl(filters);
  const apiHref = apiQuery ? `/api/search?${apiQuery}` : "/api/search";
  const previousPageHref = page > 1 ? catalogPageHref(filters, page - 1) : null;
  const nextPageHref = page < pageCount ? catalogPageHref(filters, page + 1) : null;

  const headlineTotals = [
    ["Records", header.totals.records],
    ["Sources", header.totals.sources],
    ["People", header.totals.people],
    ["Places", header.totals.places],
    ["Subjects", header.totals.subjects],
  ] as const;
  const relationTotals = [
    ["Communities", header.totals.communities],
    ["Creator links", header.totals.recordPeople],
    ["Place links", header.totals.recordPlaces],
    ["Subject links", header.totals.recordSubjects],
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-serif text-4xl font-medium leading-none text-foreground">
          Black history catalog
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/70">
          Ask a question in plain language, or narrow the records by institution, type, place, and date.
        </p>
      </header>

      <ArchiveSearchBar
        enableModeToggle={true}
        defaultMode="keyword"
        currentFilters={filters}
        autoNavigate={true}
        initialQuestion={filters.q}
      />

      <section aria-label="Catalog totals" className={`${styles.totals} overflow-hidden`}>
        <dl className="grid grid-cols-2 md:grid-cols-5">
          {headlineTotals.map(([label, value]) => (
            <div key={label} className={`${styles.stat} px-6 py-4`}>
              <dt className="text-sm text-foreground/70">{label}</dt>
              <dd className="mt-1 font-serif text-3xl leading-none text-card-foreground">
                {value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border px-6 py-3 text-sm text-foreground/70">
          {relationTotals
            .map(([label, value]) => `${label} ${value.toLocaleString()}`)
            .join(" · ")}
        </p>
      </section>

      <CatalogFilters publishers={header.publishers} query={filters} />

      <CatalogResultsView
        records={records}
        totalMatchingCount={search.count}
        currentPage={page}
        pageCount={pageCount}
        apiHref={apiHref}
        previousPageHref={previousPageHref}
        nextPageHref={nextPageHref}
      />
    </div>
  );
}
