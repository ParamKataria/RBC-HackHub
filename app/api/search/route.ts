import { searchService } from "@/lib/services";
import { parseSearchParams } from "@/src/types";
import { type NextRequest } from "next/server";
import { ZodError } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: /api/search, search_vector, institution, SearchQuery, Postgres
 * WHAT: GET /api/search across every loaded source.
 * WHY: One route replaces per-source search. Empty q lists the records, and institution filters the publisher.
 * WHERE: /api/search?q=&institution=&type=&subject=&place=&from=&to=
 */
export async function GET(request: NextRequest) {
  try {
    const filters = parseSearchParams(request.nextUrl.searchParams);
    const result = await searchService.searchRecords(filters);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Invalid search";
      return Response.json({ error: message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
