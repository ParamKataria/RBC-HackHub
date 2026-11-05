import Link from "next/link";

import { AskArchive } from "@/app/catalog/_components/ask-archive";
import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const totals = [
    ["Records", header.totals.records],
    ["Sources", header.totals.sources],
    ["People", header.totals.people],
    ["Places", header.totals.places],
    ["Subjects", header.totals.subjects],
    ["Communities", header.totals.communities],
    ["Creator links", header.totals.recordPeople],
    ["Place links", header.totals.recordPlaces],
    ["Subject links", header.totals.recordSubjects],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Black history catalog
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Ask the archive turns a question into the same filters as GET /api/search.
          The answer cites record ids from that search.
        </p>
      </div>

      <AskArchive />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {totals.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold text-card-foreground">
              {value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <CatalogFilters publishers={header.publishers} query={filters} />

      <p className="text-sm text-muted-foreground">
        {search.count.toLocaleString()} matching records · page {page} of {pageCount}
        {" · "}
        <a href={apiHref} className="text-primary underline-offset-4 hover:underline">
          {apiHref}
        </a>
      </p>

      <div className="flex flex-col gap-4">
        {records.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`/catalog/${record.id}`} className="hover:underline">
                  {record.dc_title}
                </Link>
              </CardTitle>
              <CardDescription>{record.dc_publisher}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{record.dc_type}</Badge>
                <Badge variant="outline">{recordDateLabel(record)}</Badge>
                <Badge variant="outline">
                  {record.bccns_digitized ? "Digitized" : "Not digitized"}
                </Badge>
                {record.bccns_access_status ? (
                  <Badge variant="outline">{record.bccns_access_status}</Badge>
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
          <p className="text-sm text-muted-foreground">No records match this search.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={catalogPageHref(filters, page - 1)}>Previous</Link>
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button variant="outline" asChild>
            <Link href={catalogPageHref(filters, page + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
