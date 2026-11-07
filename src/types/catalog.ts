import { z } from "zod";

import { searchQuerySchema } from "./search";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogQuery, CatalogRecord, CatalogRecordDetail, raw_metadata, dc_identifier, CatalogFiltersProps
 * WHAT: Zod schemas and types for the public Black history catalog.
 * WHY: Search input, component props, and Postgres rows are checked in one place before the page renders them.
 * WHERE: lib/services/catalog.ts and app/catalog.
 */

const searchValueSchema = z.union([z.string(), z.array(z.string())]).optional();

export const catalogSearchParamsSchema = z.object({
  q: searchValueSchema,
  publisher: searchValueSchema,
  page: searchValueSchema,
});

export type CatalogSearchParams = z.infer<typeof catalogSearchParamsSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: firstSearchValue, searchValueSchema, CatalogSearchParams, queryParamString, parseCatalogSearchParams
 * WHAT: Extracts the first string value from a Next.js search param string or string array.
 * WHY: URL query parameters in Next.js App Router can be repeated as string arrays or omitted.
 * WHERE: parseCatalogSearchParams in src/types/catalog.ts and CatalogResults in app/catalog/_components/catalog-results.tsx.
 */
export function firstSearchValue(value: string | string[] | undefined): string {
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
 * SOURCE OF TRUTH KEYWORDS: parseCatalogSearchParams, CatalogQuery, CatalogSearchParams, publisher, page, search
 * WHAT: Turns catalog URL search params into a validated query.
 * WHY: The catalog form is a GET form, so the page must reject odd or oversized params.
 * WHERE: app/catalog page before it calls the catalog service.
 */
export function parseCatalogSearchParams(
  input: CatalogSearchParams,
): CatalogQuery {
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

export const catalogViewSchema = z.object({
  query: catalogQuerySchema,
  totals: catalogTotalsSchema,
  publishers: z.array(z.string()),
  records: z.array(catalogRecordSchema),
  matchCount: z.number().int().nonnegative(),
  pageCount: z.number().int().min(1),
});

export type CatalogView = z.infer<typeof catalogViewSchema>;

export const catalogSearchParamsInputSchema = z.object({
  q: searchValueSchema,
  institution: searchValueSchema,
  type: searchValueSchema,
  creator: searchValueSchema,
  subject: searchValueSchema,
  place: searchValueSchema,
  from: searchValueSchema,
  to: searchValueSchema,
  page: searchValueSchema,
});

export type CatalogSearchParamsInput = z.infer<
  typeof catalogSearchParamsInputSchema
>;

export const catalogPagePropsSchema = z.object({
  searchParams: z.promise(catalogSearchParamsInputSchema),
});

export type CatalogPageProps = z.infer<typeof catalogPagePropsSchema>;

export const catalogRecordPageParamsSchema = z.object({
  id: z.string().min(1),
});

export type CatalogRecordPageParams = z.infer<
  typeof catalogRecordPageParamsSchema
>;

export const catalogRecordPagePropsSchema = z.object({
  params: z.promise(catalogRecordPageParamsSchema),
});

export type CatalogRecordPageProps = z.infer<typeof catalogRecordPagePropsSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: secondaryFilterKeys, countActiveSecondaryFilters, SecondaryFilterKey, facetBadgeCounter, filterCounter
 * WHAT: Readonly tuple of catalog secondary facet parameter keys and tally function for active secondary filters excluding q.
 * WHY: Canonical calculation for filter pill badge and accordion clear button shared between server and client components.
 * WHERE: src/types/catalog.ts, app/catalog/_components/catalog-filters.tsx, and app/catalog/_components/catalog-search-section.tsx.
 */
export const secondaryFilterKeys = [
  "institution",
  "type",
  "creator",
  "subject",
  "place",
  "from",
  "to",
] as const;

export type SecondaryFilterKey = (typeof secondaryFilterKeys)[number];

export function countActiveSecondaryFilters(
  query: Partial<Record<string, string | undefined>>,
): number {
  return secondaryFilterKeys.reduce((count, key) => {
    const value = query[key];
    return typeof value === "string" && value.trim().length > 0
      ? count + 1
      : count;
  }, 0);
}

/**
 * SOURCE OF TRUTH KEYWORDS: catalogFiltersPropsSchema, CatalogFiltersProps, hideHeaderToggle, controlledFilterExpansion, collapsibleFacetPanel, onToggle
 * WHAT: Validated props schema and type definition for the CatalogFilters collapsible facet component.
 * WHY: Enforces strict typing for publishers, query parameters, controlled visibility state, and header toggle suppression.
 * WHERE: src/types/catalog.ts, app/catalog/_components/catalog-filters.tsx, and app/catalog/_components/catalog-search-section.tsx.
 */
export const catalogFiltersPropsSchema = z.object({
  publishers: z.array(z.string()),
  query: searchQuerySchema,
  defaultOpen: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  hideHeaderToggle: z.boolean().optional(),
});

export type CatalogFiltersProps = z.infer<typeof catalogFiltersPropsSchema> & {
  onToggle?: () => void;
};

/**
 * SOURCE OF TRUTH KEYWORDS: catalogSearchSectionPropsSchema, CatalogSearchSectionProps, CatalogSearchSection, searchCoordinatorProps, searchFiltersSync
 * WHAT: Validated props schema and TypeScript type for the interactive CatalogSearchSection client coordinator.
 * WHY: Enforces strict type validation for institutional publisher lists and multi-facet search filters.
 * WHERE: src/types/catalog.ts and app/catalog/_components/catalog-search-section.tsx.
 */
export const catalogSearchSectionPropsSchema = z.object({
  publishers: z.array(z.string()),
  filters: searchQuerySchema,
});

export type CatalogSearchSectionProps = z.infer<
  typeof catalogSearchSectionPropsSchema
>;

export const linkedListPropsSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.string()),
});

export type LinkedListProps = z.infer<typeof linkedListPropsSchema>;

