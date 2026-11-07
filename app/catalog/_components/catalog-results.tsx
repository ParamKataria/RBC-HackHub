import Link from "next/link";

import { AskArchive } from "@/app/catalog/_components/ask-archive";
import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import styles from "@/app/catalog/_components/catalog-results.module.css";
import { Button } from "@/components/ui/button";
import { catalogService, searchService } from "@/lib/services";
import {
  parseSearchParams,
  type CatalogRecord,
  type SearchQuery,
} from "@/src/types";
import { ZodError } from "zod";

const PAGE_SIZE = 20;

type CatalogSearchParams = {
  q?: string | string[];
  institution?: string | string[];
  type?: string | string[];
  subject?: string | string[];
  place?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
};

/**
 * SOURCE OF TRUTH KEYWORDS: searchParamsToUrl, SearchQuery, /api/search, page
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
 * SOURCE OF TRUTH KEYWORDS: catalogPageHref, SearchQuery, pagination
 * WHAT: Builds a catalog page link for the active full-text filters.
 * WHY: Page 1 with no filters should stay on /catalog.
 * WHERE: Previous and next links.
 */
function catalogPageHref(filters: SearchQuery, page: number): string {
  const query = searchParamsToUrl(filters, page);
  return query ? `/catalog?${query}` : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordDateLabel, dc_date, date_text
 * WHAT: Picks the ISO date or the original vague date text.
 * WHY: Only exact dates live in dc_date, and the card still needs to show circa dates.
 * WHERE: Catalog record cards.
 */
function recordDateLabel(record: CatalogRecord): string {
  return record.dc_date ?? record.date_text ?? "Date not recorded";
}

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogResults, CatalogRecord, Postgres totals, searchParams
 * WHAT: Renders catalog totals, filters, and one page of records.
 * WHY: This is the sample page for checking that the CSV landed in Postgres.
 * WHERE: app/catalog/page.tsx inside Suspense.
 */
export async function CatalogResults({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const rawParams = await searchParams;
  const requestParams = new URLSearchParams();
  for (const key of ["q", "institution", "type", "subject", "place", "from", "to"] as const) {
    const value = rawParams[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) {
      requestParams.set(key, first);
    }
  }
  const pageText = Array.isArray(rawParams.page) ? rawParams.page[0] : rawParams.page;
  const requestedPage = Number.parseInt(pageText ?? "", 10);

  let filters: SearchQuery;
  try {
    filters = parseSearchParams(requestParams);
  } catch (error) {
    const message =
      error instanceof ZodError ? (error.issues[0]?.message ?? "Invalid search") : "Invalid search";
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
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
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
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

      <AskArchive />

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

      <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 text-sm">
        <p className="text-foreground">
          {search.count.toLocaleString()} matching records
        </p>
        <p className="text-foreground/70">
          Page {page} of {pageCount}
          {" · "}
          <a href={apiHref} className="text-primary underline-offset-4 hover:underline">
            Open this search
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {records.map((record) => (
          <article key={record.id} className={`${styles.record} px-6 py-5`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1">
              <h2 className="min-w-0 font-serif text-2xl font-medium leading-tight">
                <Link href={`/catalog/${record.id}`} className="hover:text-primary">
                  {record.dc_title}
                </Link>
              </h2>
              <p className="whitespace-nowrap text-right text-sm text-foreground/70">{recordDateLabel(record)}</p>
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
            <a
              href={record.dc_identifier}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              Source
            </a>
          </article>
        ))}
        {records.length === 0 ? (
          <p className={`${styles.empty} px-6 py-8 text-sm text-foreground/70`}>
            No records match this search.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          {page > 1 ? (
            <Button variant="outline" className={`${styles.pageLink} shadow-none`} asChild>
              <Link href={catalogPageHref(filters, page - 1)}>Previous</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-center text-sm text-foreground/70">
          Page {page} of {pageCount}
        </p>
        <div className="justify-self-end">
          {page < pageCount ? (
            <Button variant="outline" className={`${styles.pageLink} shadow-none`} asChild>
              <Link href={catalogPageHref(filters, page + 1)}>Next</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
