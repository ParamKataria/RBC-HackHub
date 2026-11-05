import "server-only";

import { createClient } from "@/lib/supabase/server";
import { catalogRecordSchema, type SearchQuery, type SearchResponse } from "@/src/types";
import { z } from "zod";

const PAGE_SIZE = 500;

const SEARCH_COLUMNS =
  "id,dc_title,dc_identifier,dc_publisher,dc_source,dc_type,dc_description,dc_creator,dc_subject,dc_date,date_text,dcterms_spatial,dcterms_temporal,dc_rights,dcterms_access_rights,dcterms_provenance,bccns_community,bccns_access_status,bccns_digitized";

/**
 * SOURCE OF TRUTH KEYWORDS: failIf, PostgrestError, search query
 * WHAT: Stops a search read when Postgres returns an error.
 * WHY: The route should report the database message instead of an empty result.
 * WHERE: searchRecords.
 */
function failIf(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: searchRecords, search_vector, institution, GIN, websearch
 * WHAT: Runs one full-text query across every source, with optional filters.
 * WHY: /api/search is the single search. An empty q lists the catalog, and institution limits the publisher.
 * WHERE: app/api/search/route.ts.
 */
export async function searchRecords(filters: SearchQuery): Promise<SearchResponse> {
  const supabase = await createClient();
  const results = [];
  let count = 0;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("records")
      .select(SEARCH_COLUMNS, { count: "exact" })
      .order("dc_publisher", { ascending: true })
      .order("dc_title", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.q) {
      query = query.textSearch("search_vector", filters.q, {
        type: "websearch",
        config: "english",
      });
    }
    if (filters.institution) {
      query = query.eq("dc_publisher", filters.institution);
    }
    if (filters.type) {
      query = query.eq("dc_type", filters.type);
    }
    if (filters.subject) {
      query = query.contains("dc_subject", [filters.subject]);
    }
    if (filters.place) {
      query = query.ilike("dcterms_spatial", `%${filters.place}%`);
    }
    if (filters.from) {
      query = query.gte("dc_date", filters.from);
    }
    if (filters.to) {
      query = query.lte("dc_date", filters.to);
    }

    const { data, error, count: total } = await query;
    failIf(error);
    const page = z.array(catalogRecordSchema).parse(data);
    count = total ?? count;
    results.push(...page);
    if (page.length < PAGE_SIZE || results.length >= count) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return { count, filters, results };
}
