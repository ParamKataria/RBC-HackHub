import "server-only";

/**
 * SOURCE OF TRUTH KEYWORDS: searchService, searchRecords, recordsByIds, recordMatchesDateRange, extractDateInterval, search_vector
 * WHAT: Server-only Postgres full-text search service with entity and historical date-interval filtering.
 * WHY: Centralizes Supabase record queries so /api/search, /catalog, and /api/ask share one retrieval seam.
 * WHERE: app/api/search/route.ts, app/catalog/_components/catalog-results.tsx, and lib/services/ask.ts.
 */

import { createClient } from "@/lib/supabase/server";
import {
  catalogRecordSchema,
  extractDateInterval,
  recordMatchesDateRange,
  type CatalogRecord,
  type SearchOptions,
  type SearchQuery,
  type SearchResponse,
} from "@/src/types";
import { z } from "zod";

export { extractDateInterval, recordMatchesDateRange };

const PAGE_SIZE = 500;

const SEARCH_COLUMNS =
  "id,dc_title,dc_identifier,dc_publisher,dc_source,dc_type,dc_description,dc_creator,dc_subject,dc_date,date_text,dcterms_spatial,dcterms_temporal,dc_rights,dcterms_access_rights,dcterms_provenance,bccns_community,bccns_access_status,bccns_digitized";

/**
 * SOURCE OF TRUTH KEYWORDS: failIf, PostgrestError, searchRecords, recordsByIds, supabaseError
 * WHAT: Stops a search read when Postgres returns an error.
 * WHY: The route should report the database message instead of an empty result.
 * WHERE: searchRecords and recordsByIds in lib/services/search.ts.
 */
function failIf(error: Error | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: searchRecords, search_vector, institution, dc_creator, recordMatchesDateRange
 * WHAT: Runs one full-text query across every source, with optional institution, creator, field, and historical date interval filters.
 * WHY: /api/search is the single search. Historical date filters evaluate non-destructive interval overlap across dc_date, date_text, and dcterms_temporal.
 * WHERE: app/api/search/route.ts, app/catalog/_components/catalog-results.tsx, and lib/services/ask.ts.
 */
export async function searchRecords(
  filters: SearchQuery,
  options?: SearchOptions,
): Promise<SearchResponse> {
  const supabase = await createClient();
  const candidates: CatalogRecord[] = [];
  let count = 0;
  let offset = 0;
  const limit = options?.limit;
  const hasDateFilter = Boolean(filters.from || filters.to);

  while (true) {
    const remaining =
      hasDateFilter || limit === undefined
        ? PAGE_SIZE
        : limit - candidates.length;
    if (remaining <= 0) {
      break;
    }
    const pageSize = Math.min(PAGE_SIZE, remaining);
    let query = supabase
      .from("records")
      .select(SEARCH_COLUMNS, { count: "exact" })
      .order("dc_publisher", { ascending: true })
      .order("dc_title", { ascending: true })
      .range(offset, offset + pageSize - 1);

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
    if (filters.creator) {
      query = query.ilike("dc_creator", `%${filters.creator}%`);
    }
    if (filters.subject) {
      query = query.contains("dc_subject", [filters.subject]);
    }
    if (filters.place) {
      query = query.ilike("dcterms_spatial", `%${filters.place}%`);
    }

    const { data, error, count: total } = await query;
    failIf(error);
    const page = z.array(catalogRecordSchema).parse(data);
    count = total ?? count;
    candidates.push(...page);
    if (page.length < pageSize || candidates.length >= count) {
      break;
    }
    offset += pageSize;
  }

  if (hasDateFilter) {
    const filtered = candidates.filter((record) =>
      recordMatchesDateRange(record, filters.from, filters.to),
    );
    const results =
      limit !== undefined ? filtered.slice(0, limit) : filtered;
    return {
      count: filtered.length,
      filters,
      results,
    };
  }

  return { count, filters, results: candidates };
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordsByIds, CatalogRecord, recordId, SEARCH_COLUMNS, askArchive
 * WHAT: Loads catalog rows for the record ids the viewer is standing in front of.
 * WHY: Ask can place those rows ahead of the general search without trusting a description sent from the browser.
 * WHERE: lib/services/ask.ts when a room or picture is in view.
 */
export async function recordsByIds(
  ids: readonly string[],
): Promise<CatalogRecord[]> {
  if (ids.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("records")
    .select(SEARCH_COLUMNS)
    .in("id", [...ids]);
  failIf(error);
  return z.array(catalogRecordSchema).parse(data);
}
