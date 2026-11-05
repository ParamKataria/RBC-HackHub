import Link from "next/link";

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
import { catalogService } from "@/lib/services";
import { parseCatalogSearchParams, type CatalogQuery, type CatalogRecord } from "@/src/types";

type CatalogSearchParams = {
  q?: string | string[];
  publisher?: string | string[];
  page?: string | string[];
};

/**
 * SOURCE OF TRUTH KEYWORDS: catalogHref, CatalogQuery, pagination, publisher
 * WHAT: Builds a catalog URL that keeps the active search.
 * WHY: Page links must not drop the publisher or text filter.
 * WHERE: Catalog result pagination.
 */
function catalogHref(query: CatalogQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.publisher) {
    params.set("publisher", query.publisher);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const search = params.toString();
  return search ? `/catalog?${search}` : "/catalog";
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
  const parsedQuery = parseCatalogSearchParams(await searchParams);

  let view;
  try {
    view = await catalogService.getCatalog(parsedQuery);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog query failed";
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
        {message}
      </p>
    );
  }

  const totals = [
    ["Records", view.totals.records],
    ["Sources", view.totals.sources],
    ["People", view.totals.people],
    ["Places", view.totals.places],
    ["Subjects", view.totals.subjects],
    ["Communities", view.totals.communities],
    ["Creator links", view.totals.recordPeople],
    ["Place links", view.totals.recordPlaces],
    ["Subject links", view.totals.recordSubjects],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Black history catalog
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Postgres records loaded from the metadata CSV. The CSV has 1,166 rows.
          Communities stay empty because no source field maps to a community.
        </p>
      </div>

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

      <CatalogFilters publishers={view.publishers} query={view.query} />

      <p className="text-sm text-muted-foreground">
        {view.matchCount.toLocaleString()} matching records · page {view.query.page} of{" "}
        {view.pageCount}
      </p>

      <div className="flex flex-col gap-4">
        {view.records.map((record) => (
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
        {view.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No records match this search.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {view.query.page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={catalogHref(view.query, view.query.page - 1)}>Previous</Link>
          </Button>
        ) : null}
        {view.query.page < view.pageCount ? (
          <Button variant="outline" asChild>
            <Link href={catalogHref(view.query, view.query.page + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
