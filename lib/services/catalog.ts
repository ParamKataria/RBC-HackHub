import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  catalogRecordDetailSchema,
  catalogRecordSchema,
  catalogTotalsSchema,
  recordIdSchema,
  type CatalogQuery,
  type CatalogRecordDetail,
  type CatalogTotals,
  type CatalogView,
} from "@/src/types";
import { z } from "zod";

const PAGE_SIZE = 20;

const LIST_COLUMNS =
  "id,dc_title,dc_identifier,dc_publisher,dc_source,dc_type,dc_description,dc_creator,dc_subject,dc_date,date_text,dcterms_spatial,dcterms_temporal,dc_rights,dcterms_access_rights,dcterms_provenance,bccns_community,bccns_access_status,bccns_digitized";

const DETAIL_COLUMNS = `${LIST_COLUMNS},raw_metadata,record_people(role,people(name)),record_places(places(name)),record_subjects(subjects(name)),record_communities(communities(name))`;

const publisherRowsSchema = z.array(z.object({ name: z.string() }));

type CountTable =
  | "records"
  | "sources"
  | "people"
  | "places"
  | "subjects"
  | "communities"
  | "record_people"
  | "record_places"
  | "record_subjects";

/**
 * SOURCE OF TRUTH KEYWORDS: failIf, PostgrestError, catalog query
 * WHAT: Stops a catalog read when Postgres returns an error.
 * WHY: The page should show the database message instead of an empty list.
 * WHERE: Every catalog service query.
 */
/**
 * SOURCE OF TRUTH KEYWORDS: searchFilter, ilike, dc_title, dc_creator
 * WHAT: Builds a quoted PostgREST or-filter for title, description, and creator.
 * WHY: Spaces in a search term must stay inside the filter value.
 * WHERE: getCatalog count and list queries.
 */
function searchFilter(term: string): string {
  const pattern = `"%${term}%"`;
  return `dc_title.ilike.${pattern},dc_description.ilike.${pattern},dc_creator.ilike.${pattern}`;
}

function failIf(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: countTable, CatalogTotals, Postgres count
 * WHAT: Counts rows in one public catalog table.
 * WHY: The test page needs live totals for records and each join table.
 * WHERE: getCatalog totals strip.
 */
async function countTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: CountTable,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  failIf(error);
  return count ?? 0;
}

/**
 * SOURCE OF TRUTH KEYWORDS: getCatalogTotals, sources, records, communities
 * WHAT: Reads row counts for the catalog tables.
 * WHY: Confirms the CSV load is present in Postgres, including empty communities.
 * WHERE: Catalog index header.
 */
async function getCatalogTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CatalogTotals> {
  const [
    records,
    sources,
    people,
    places,
    subjects,
    communities,
    recordPeople,
    recordPlaces,
    recordSubjects,
  ] = await Promise.all([
    countTable(supabase, "records"),
    countTable(supabase, "sources"),
    countTable(supabase, "people"),
    countTable(supabase, "places"),
    countTable(supabase, "subjects"),
    countTable(supabase, "communities"),
    countTable(supabase, "record_people"),
    countTable(supabase, "record_places"),
    countTable(supabase, "record_subjects"),
  ]);

  return catalogTotalsSchema.parse({
    records,
    sources,
    people,
    places,
    subjects,
    communities,
    recordPeople,
    recordPlaces,
    recordSubjects,
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: getCatalogHeader, CatalogTotals, publishers, sources
 * WHAT: Reads catalog totals and the publisher names.
 * WHY: The test page needs those counts while the record list comes from /api/search.
 * WHERE: app/catalog search results.
 */
export async function getCatalogHeader(): Promise<{
  totals: CatalogTotals;
  publishers: string[];
}> {
  const supabase = await createClient();
  const totals = await getCatalogTotals(supabase);
  const publishersResult = await supabase.from("sources").select("name").order("name");
  failIf(publishersResult.error);
  const publishers = publisherRowsSchema
    .parse(publishersResult.data)
    .map((source) => source.name);
  return { totals, publishers };
}

/**
 * SOURCE OF TRUTH KEYWORDS: getCatalog, CatalogView, publisher filter, ilike search
 * WHAT: Loads one page of records plus catalog totals.
 * WHY: The sample catalog page searches Postgres without copying collection files.
 * WHERE: app/catalog/page.tsx.
 */
export async function getCatalog(query: CatalogQuery): Promise<CatalogView> {
  const { totals, publishers } = await getCatalogHeader();
  const supabase = await createClient();

  let countQuery = supabase
    .from("records")
    .select("id", { count: "exact", head: true });
  if (query.publisher) {
    countQuery = countQuery.eq("dc_publisher", query.publisher);
  }
  if (query.q) {
    countQuery = countQuery.or(searchFilter(query.q));
  }
  const countResult = await countQuery;
  failIf(countResult.error);
  const matchCount = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("records")
    .select(LIST_COLUMNS)
    .order("dc_publisher", { ascending: true })
    .order("dc_title", { ascending: true })
    .range(from, to);
  if (query.publisher) {
    listQuery = listQuery.eq("dc_publisher", query.publisher);
  }
  if (query.q) {
    listQuery = listQuery.or(searchFilter(query.q));
  }
  const listResult = await listQuery;
  failIf(listResult.error);

  return {
    query: { ...query, page },
    totals,
    publishers,
    records: z.array(catalogRecordSchema).parse(listResult.data),
    matchCount,
    pageCount,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: getCatalogRecord, CatalogRecordDetail, raw_metadata, record id
 * WHAT: Loads one record with people, places, subjects, and original metadata.
 * WHY: The detail page is how a tester checks that a CSV row survived ingest.
 * WHERE: app/catalog/[id]/page.tsx.
 */
export async function getCatalogRecord(
  id: string,
): Promise<CatalogRecordDetail | null> {
  const parsedId = recordIdSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const supabase = await createClient();
  const result = await supabase
    .from("records")
    .select(DETAIL_COLUMNS)
    .eq("id", parsedId.data)
    .maybeSingle();
  failIf(result.error);
  if (!result.data) {
    return null;
  }

  return catalogRecordDetailSchema.parse(result.data);
}

export const catalogPageSize = PAGE_SIZE;
