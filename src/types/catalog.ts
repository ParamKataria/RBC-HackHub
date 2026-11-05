import { z } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogQuery, CatalogRecord, CatalogRecordDetail, raw_metadata, dc_identifier
 * WHAT: Zod schemas and types for the public Black history catalog.
 * WHY: Search input and Postgres rows are checked in one place before the page renders them.
 * WHERE: lib/services/catalog.ts and app/catalog.
 */

const searchValueSchema = z.union([z.string(), z.array(z.string())]).optional();

const catalogSearchParamsSchema = z.object({
  q: searchValueSchema,
  publisher: searchValueSchema,
  page: searchValueSchema,
});

function firstSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export const catalogQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .transform((value) =>
      value.replace(/[%_,.()\\"]/g, " ").replace(/\s+/g, " ").trim(),
    ),
  publisher: z.string().trim().max(200),
  page: z.number().int().min(1).max(500),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: parseCatalogSearchParams, CatalogQuery, publisher, page, search
 * WHAT: Turns catalog URL search params into a validated query.
 * WHY: The catalog form is a GET form, so the page must reject odd or oversized params.
 * WHERE: app/catalog page before it calls the catalog service.
 */
export function parseCatalogSearchParams(input: {
  q?: string | string[];
  publisher?: string | string[];
  page?: string | string[];
}): CatalogQuery {
  const params = catalogSearchParamsSchema.parse(input);
  const pageText = firstSearchValue(params.page);
  const pageNumber = Number.parseInt(pageText, 10);

  return catalogQuerySchema.parse({
    q: firstSearchValue(params.q),
    publisher: firstSearchValue(params.publisher),
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  });
}

export const recordIdSchema = z.string().uuid();

const metadataValueSchema = z.string();

export const catalogRecordSchema = z.object({
  id: recordIdSchema,
  dc_title: z.string(),
  dc_identifier: z.string(),
  dc_publisher: z.string(),
  dc_source: z.string(),
  dc_type: z.string(),
  dc_description: z.string().nullable(),
  dc_creator: z.string().nullable(),
  dc_subject: z.array(z.string()),
  dc_date: z.string().nullable(),
  date_text: z.string().nullable(),
  dcterms_spatial: z.string().nullable(),
  dcterms_temporal: z.string().nullable(),
  dc_rights: z.string().nullable(),
  dcterms_access_rights: z.string().nullable(),
  dcterms_provenance: z.string().nullable(),
  bccns_community: z.array(z.string()),
  bccns_access_status: z.string().nullable(),
  bccns_digitized: z.boolean().nullable(),
});

export type CatalogRecord = z.infer<typeof catalogRecordSchema>;

const linkedNameSchema = z.object({
  name: z.string(),
});

export const catalogRecordDetailSchema = catalogRecordSchema.extend({
  raw_metadata: z.record(z.string(), metadataValueSchema),
  record_people: z.array(
    z.object({
      role: z.string(),
      people: linkedNameSchema,
    }),
  ),
  record_places: z.array(
    z.object({
      places: linkedNameSchema,
    }),
  ),
  record_subjects: z.array(
    z.object({
      subjects: linkedNameSchema,
    }),
  ),
  record_communities: z.array(
    z.object({
      communities: linkedNameSchema,
    }),
  ),
});

export type CatalogRecordDetail = z.infer<typeof catalogRecordDetailSchema>;

export const catalogTotalsSchema = z.object({
  records: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
  people: z.number().int().nonnegative(),
  places: z.number().int().nonnegative(),
  subjects: z.number().int().nonnegative(),
  communities: z.number().int().nonnegative(),
  recordPeople: z.number().int().nonnegative(),
  recordPlaces: z.number().int().nonnegative(),
  recordSubjects: z.number().int().nonnegative(),
});

export type CatalogTotals = z.infer<typeof catalogTotalsSchema>;

export type CatalogView = {
  query: CatalogQuery;
  totals: CatalogTotals;
  publishers: string[];
  records: CatalogRecord[];
  matchCount: number;
  pageCount: number;
};
