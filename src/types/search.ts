import { z } from "zod";

import { catalogRecordSchema } from "./catalog";

/**
 * SOURCE OF TRUTH KEYWORDS: SearchQuery, search_vector, institution, dc_type, creator, DateInterval
 * WHAT: Validated filters and historical date-interval helpers for the single Postgres full-text search route.
 * WHY: /api/search accepts one query across every source, plus optional institution, creator, field, and historical date filters.
 * WHERE: lib/services/search.ts, lib/services/ask.ts, app/api/search/route.ts, and app/catalog.
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

/**
 * SOURCE OF TRUTH KEYWORDS: normalizeBlankString, optionalText, searchQuerySchema, queryParamTrim, emptyToUndefined
 * WHAT: Trims an optional string input and turns empty or whitespace-only strings into undefined.
 * WHY: Empty query string parameters in /api/search and /catalog mean "no filter applied".
 * WHERE: optionalText, optionalRecordType, fromDateFilter, and toDateFilter in src/types/search.ts.
 */
function normalizeBlankString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform(normalizeBlankString)
  .pipe(
    z
      .string()
      .max(200)
      .transform((value) =>
        value.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim(),
      )
      .optional(),
  );

const optionalRecordType = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    const normalized = normalizeBlankString(value);
    return normalized ? normalized.toLowerCase() : undefined;
  })
  .pipe(z.enum(recordTypeValues).optional());

/**
 * SOURCE OF TRUTH KEYWORDS: normalizeYearBound, fromDateFilter, toDateFilter, recordMatchesDateRange, isoYearBound
 * WHAT: Expands a 4-digit year string into its inclusive YYYY-01-01 start or YYYY-12-31 end date bound.
 * WHY: Keeps 4-digit year normalization in a single helper shared by schema validation and date-range matching.
 * WHERE: fromDateFilter, toDateFilter, and recordMatchesDateRange in src/types/search.ts.
 */
function normalizeYearBound(value: string, bound: "start" | "end"): string {
  if (!/^\d{4}$/.test(value)) {
    return value;
  }
  return bound === "start" ? `${value}-01-01` : `${value}-12-31`;
}

const fromDateFilter = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    const normalized = normalizeBlankString(value);
    return normalized ? normalizeYearBound(normalized, "start") : undefined;
  })
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY or YYYY-MM-DD date")
      .optional(),
  );

const toDateFilter = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    const normalized = normalizeBlankString(value);
    return normalized ? normalizeYearBound(normalized, "end") : undefined;
  })
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY or YYYY-MM-DD date")
      .optional(),
  );

export const searchQuerySchema = z
  .object({
    q: optionalText,
    institution: optionalText,
    type: optionalRecordType,
    creator: optionalText,
    subject: optionalText,
    place: optionalText,
    from: fromDateFilter,
    to: toDateFilter,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be on or before to",
    path: ["from"],
  });

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchOptionsSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

export const searchResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  filters: searchQuerySchema,
  results: z.array(z.lazy(() => catalogRecordSchema)),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const dateIntervalSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DateInterval = z.infer<typeof dateIntervalSchema>;

export const dateRecordFieldsSchema = z.object({
  dc_date: z.string().nullable().optional(),
  date_text: z.string().nullable().optional(),
  dcterms_temporal: z.string().nullable().optional(),
});

export type DateRecordFields = z.infer<typeof dateRecordFieldsSchema>;

const MONTH_NUMBERS: Readonly<Record<string, string>> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

/**
 * SOURCE OF TRUTH KEYWORDS: parseSearchParams, SearchQuery, institution, creator, from, to
 * WHAT: Reads the /api/search query string into a validated SearchQuery.
 * WHY: Empty values mean "no filter", and the date and type filters must be rejected when they are not valid.
 * WHERE: app/api/search/route.ts and app/catalog/_components/catalog-results.tsx.
 */
export function parseSearchParams(params: URLSearchParams): SearchQuery {
  return searchQuerySchema.parse({
    q: params.get("q") ?? undefined,
    institution: params.get("institution") ?? undefined,
    type: params.get("type") ?? undefined,
    creator: params.get("creator") ?? undefined,
    subject: params.get("subject") ?? undefined,
    place: params.get("place") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: parseProseCalendarDate, MONTH_NUMBERS, extractDateInterval, date_text, dcterms_temporal
 * WHAT: Parses a single prose calendar date (such as "22 September 1750" or "January 25, 1750") into an exact YYYY-MM-DD string.
 * WHY: Historical records from Nova Scotia Archives and LAC often store exact day-month-year strings in date_text or dcterms_temporal.
 * WHERE: extractDateInterval in src/types/search.ts.
 */
function parseProseCalendarDate(trimmed: string): string | null {
  if (/\bbetween\b|\bto\b|\d{4}\s*[-–—]\s*\d{4}/i.test(trimmed)) {
    return null;
  }

  const dayFirstMatch = trimmed.match(
    /^(?:ca\.?\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(1[6-9]\d{2}|20\d{2})$/i,
  );
  if (dayFirstMatch) {
    const dayNum = Number.parseInt(dayFirstMatch[1] ?? "", 10);
    const monthCode = MONTH_NUMBERS[(dayFirstMatch[2] ?? "").toLowerCase()];
    const year = dayFirstMatch[3];
    if (monthCode && year && dayNum >= 1 && dayNum <= 31) {
      return `${year}-${monthCode}-${String(dayNum).padStart(2, "0")}`;
    }
  }

  const monthFirstMatch = trimmed.match(
    /^(?:ca\.?\s*)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(1[6-9]\d{2}|20\d{2})$/i,
  );
  if (monthFirstMatch) {
    const monthCode = MONTH_NUMBERS[(monthFirstMatch[1] ?? "").toLowerCase()];
    const dayNum = Number.parseInt(monthFirstMatch[2] ?? "", 10);
    const year = monthFirstMatch[3];
    if (monthCode && year && dayNum >= 1 && dayNum <= 31) {
      return `${year}-${monthCode}-${String(dayNum).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * SOURCE OF TRUTH KEYWORDS: extractDateInterval, DateInterval, dc_date, date_text, dcterms_temporal, historicalDates
 * WHAT: Derives a non-destructive { start, end } ISO date interval from an archival date string.
 * WHY: Enables historical period filtering across ISO dates, prose calendar dates, circa years, and multi-year spans without mutating stored text.
 * WHERE: recordMatchesDateRange in src/types/search.ts and lib/services/search.ts.
 */
export function extractDateInterval(
  text: string | null | undefined,
): DateInterval | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoMatch?.[1]) {
    return { start: isoMatch[1], end: isoMatch[1] };
  }

  const proseIso = parseProseCalendarDate(trimmed);
  if (proseIso) {
    return { start: proseIso, end: proseIso };
  }

  const years: number[] = [];

  for (const decadeMatch of trimmed.matchAll(/\b(1[6-9]\d0|20\d0)'?s\b/gi)) {
    if (decadeMatch[1]) {
      const baseYear = Number.parseInt(decadeMatch[1], 10);
      years.push(baseYear, baseYear + 9);
    }
  }

  for (const yearMatch of trimmed.matchAll(/\b(1[6-9]\d{2}|20\d{2})\b/g)) {
    if (yearMatch[1]) {
      years.push(Number.parseInt(yearMatch[1], 10));
    }
  }

  if (years.length === 0) {
    return null;
  }

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return {
    start: `${minYear}-01-01`,
    end: `${maxYear}-12-31`,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordMatchesDateRange, extractDateInterval, DateRecordFields, dc_date, date_text, dcterms_temporal
 * WHAT: Checks whether any date field on a catalog record overlaps the requested [from, to] date window.
 * WHY: Matches records whose historical dates live in date_text or dcterms_temporal even when dc_date is null or holds a modern publication date.
 * WHERE: searchRecords in lib/services/search.ts.
 */
export function recordMatchesDateRange(
  record: DateRecordFields,
  from?: string,
  to?: string,
): boolean {
  const normalizedFrom = normalizeBlankString(from);
  const normalizedTo = normalizeBlankString(to);
  const fromBound = normalizedFrom
    ? normalizeYearBound(normalizedFrom, "start")
    : undefined;
  const toBound = normalizedTo
    ? normalizeYearBound(normalizedTo, "end")
    : undefined;

  if (!fromBound && !toBound) {
    return true;
  }

  const intervals: DateInterval[] = [];
  for (const field of [
    record.dc_date,
    record.date_text,
    record.dcterms_temporal,
  ]) {
    const interval = extractDateInterval(field);
    if (interval) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    return false;
  }

  return intervals.some(
    (interval) =>
      (!fromBound || interval.end >= fromBound) &&
      (!toBound || interval.start <= toBound),
  );
}
