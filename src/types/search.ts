import { z } from "zod";

import type { CatalogRecord } from "./catalog";

/**
 * SOURCE OF TRUTH KEYWORDS: SearchQuery, search_vector, institution, dc_type, full-text
 * WHAT: Validated filters for the single Postgres full-text search route.
 * WHY: /api/search accepts one query across every source, plus optional institution and field filters.
 * WHERE: lib/services/search.ts and app/api/search/route.ts.
 */

export const recordTypeValues = [
  "photograph",
  "document",
  "oral history",
  "artifact",
  "audio",
  "video",
  "map",
  "biography",
  "article",
  "newspaper",
  "educational resource",
  "research guide",
  "poster",
  "timeline",
  "magazine",
] as const;

const blankToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const optionalText = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(200)
    .transform((value) => value.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim())
    .optional(),
);

const isoDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
    .optional(),
);

export const searchQuerySchema = z
  .object({
    q: optionalText,
    institution: optionalText,
    type: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.enum(recordTypeValues))
        .optional(),
    ),
    subject: optionalText,
    place: optionalText,
    from: isoDate,
    to: isoDate,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be on or before to",
    path: ["from"],
  });

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchResponse = {
  count: number;
  filters: SearchQuery;
  results: CatalogRecord[];
};

/**
 * SOURCE OF TRUTH KEYWORDS: parseSearchParams, SearchQuery, institution, from, to
 * WHAT: Reads the /api/search query string into a SearchQuery.
 * WHY: Empty values mean "no filter", and the date and type filters must be rejected when they are not valid.
 * WHERE: app/api/search/route.ts.
 */
export function parseSearchParams(params: URLSearchParams): SearchQuery {
  return searchQuerySchema.parse({
    q: params.get("q") ?? undefined,
    institution: params.get("institution") ?? undefined,
    type: params.get("type") ?? undefined,
    subject: params.get("subject") ?? undefined,
    place: params.get("place") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
}
