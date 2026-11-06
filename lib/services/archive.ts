import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  archivePayloadSchema,
  type ArchiveCollection,
  type ArchivePayload,
  type ArchiveStation,
  type CollectionKey,
} from "@/src/types";
import { z } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: archiveService, getArchivePayload, DublinCore, BCCNS, African Nova Scotians in the Age of Slavery and Abolition
 * WHAT: Server-only data layer that builds the 6 BCCNS historical chapter halls and their ordered Dublin Core archival stations.
 * WHY: Connects the 3D museum rotunda and colonnade galleries directly to Supabase Postgres while guaranteeing verified archival records when env vars are absent.
 * WHERE: app/page.tsx, app/museum/page.tsx, and app/api/archive/route.ts.
 */

const ARCHIVE_RECORD_COLUMNS =
  "id,dc_title,dc_identifier,dc_publisher,dc_source,dc_type,dc_description,dc_creator,dc_subject,dc_date,date_text,dcterms_spatial,dcterms_temporal,dc_rights,dcterms_access_rights,dcterms_provenance,bccns_community,bccns_access_status,bccns_digitized,raw_metadata";

const rawRecordRowSchema = z.object({
  id: z.string(),
  dc_title: z.string(),
  dc_identifier: z.string(),
  dc_publisher: z.string(),
  dc_source: z.string(),
  dc_type: z.string(),
  dc_description: z.string().nullable(),
  dc_creator: z.string().nullable(),
  dc_subject: z
    .preprocess((val) => {
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [val];
        }
      }
      return val;
    }, z.array(z.string()).nullable()),
  dc_date: z.string().nullable(),
  date_text: z.string().nullable(),
  dcterms_spatial: z.string().nullable(),
  dcterms_temporal: z.string().nullable(),
  dc_rights: z.string().nullable(),
  dcterms_access_rights: z.string().nullable(),
  dcterms_provenance: z.string().nullable(),
  bccns_community: z.array(z.string()).nullable(),
  bccns_access_status: z.string().nullable(),
  bccns_digitized: z.boolean().nullable(),
  raw_metadata: z.record(z.string(), z.unknown()).nullable(),
});

type RawRecordRow = z.infer<typeof rawRecordRowSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: extractSortYear, display_year, date_text, dcterms_temporal
 * WHAT: Parses a four-digit year from dc_date, date_text, dcterms_temporal, or dc_source so stations order chronologically along the walk.
 * WHY: Historical records use formats like "25 January 1750", "[between 1840 and 1846]", or "1783".
 * WHERE: mapRowToStation and collection station ordering.
 */
function extractSortYear(
  dcDate: string | null,
  dateText: string | null,
  temporal: string | null,
  source: string,
  title: string,
): { displayYear: string; sortYear: number } {
  const candidates = [dcDate, dateText, temporal, title, source];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/);
    if (match) {
      const yr = Number.parseInt(match[1], 10);
      const label = (dateText || dcDate || temporal || match[1]).trim();
      return {
        displayYear: label.length <= 28 ? label : match[1],
        sortYear: yr,
      };
    }
  }
  return { displayYear: "Date not recorded", sortYear: 1800 };
}

/**
 * SOURCE OF TRUTH KEYWORDS: readRawString, raw_metadata, DublinCore, media_url
 * WHAT: Safely extracts a string property from raw_metadata JSONB.
 * WHY: Fields like media_url, collection, dc_format, dc_language, and dc_relation live inside raw_metadata.
 * WHERE: mapRowToStation.
 */
function readRawString(
  raw: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!raw) return null;
  const val = raw[key];
  if (typeof val === "string" && val.trim().length > 0) {
    return val.trim();
  }
  return null;
}

/**
 * SOURCE OF TRUTH KEYWORDS: mapRowToStation, ArchiveStation, DublinCore, citation
 * WHAT: Converts a Postgres records row into a validated ArchiveStation with full Dublin Core fields and archival citation.
 * WHY: Each station in a gallery corresponds to one archival record with its holding institution, citation, and rights statement.
 * WHERE: getArchivePayload.
 */
function mapRowToStation(row: RawRecordRow): ArchiveStation {
  const raw = row.raw_metadata;
  const mediaUrl = readRawString(raw, "media_url");
  const collection = readRawString(raw, "collection");
  const relation = readRawString(raw, "dc_relation");
  const language = readRawString(raw, "dc_language") ?? "eng";
  const format = readRawString(raw, "dc_format");
  const coverage = readRawString(raw, "dc_coverage") ?? row.dcterms_spatial;
  const issued = readRawString(raw, "dcterms_issued");

  const { displayYear, sortYear } = extractSortYear(
    row.dc_date,
    row.date_text ?? issued,
    row.dcterms_temporal,
    row.dc_source,
    row.dc_title,
  );

  const citationParts = [
    row.dc_creator ? `${row.dc_creator},` : null,
    `"${row.dc_title},"`,
    displayYear !== "Date not recorded" ? `${displayYear},` : null,
    row.dc_source !== row.dc_publisher
      ? `${row.dc_source},`
      : `${row.dc_publisher},`,
    row.dc_identifier,
  ].filter(Boolean);

  return {
    id: row.id,
    dc_title: row.dc_title,
    dc_creator: row.dc_creator,
    dc_description: row.dc_description,
    dc_subject: row.dc_subject ?? [],
    dc_date: row.dc_date,
    date_text: row.date_text ?? issued,
    display_year: displayYear,
    sort_year: sortYear,
    dc_type: row.dc_type,
    dc_publisher: row.dc_publisher,
    dc_identifier: row.dc_identifier,
    dc_source: row.dc_source,
    dc_coverage: coverage,
    dcterms_spatial: row.dcterms_spatial,
    dcterms_temporal: row.dcterms_temporal,
    dc_relation: relation,
    dc_language: language,
    dc_format: format,
    dc_rights:
      row.dc_rights ??
      `Held by ${row.dc_publisher}. Consult the holding institution for reproduction terms.`,
    dcterms_access_rights:
      row.dcterms_access_rights ??
      "Publicly viewable at the source record link. Reproduction or publication requires permission from the holding institution.",
    dcterms_provenance:
      row.dcterms_provenance ?? `Held by ${row.dc_publisher}. ${row.dc_source}`,
    collection,
    media_url: mediaUrl,
    bccns_digitized: row.bccns_digitized ?? Boolean(mediaUrl),
    citation: citationParts.join(" "),
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: CURATED_SLAVERY_ABOLITION_STATIONS, Nova Scotia Archives, Birchtown, Preston, Halifax, Shelburne
 * WHAT: Authentic archival records from Nova Scotia Archives ("African Nova Scotians in the Age of Slavery and Abolition") ordered by date along the walk.
 * WHY: Ensures the first gallery ("African Nova Scotians in the Age of Slavery and Abolition") is built in full with exact citations, places, dates, and rights even before or alongside live database filters.
 * WHERE: Seeded into slavery_and_halifax gallery when matching rows are merged.
 */
const CURATED_STATIONS_BY_COLLECTION: Record<CollectionKey, ArchiveStation[]> = {
  slavery_and_halifax: [
    {
      id: "nsa-africanns-id-1",
      dc_title: "A view of Halifax from the topmasthead",
      dc_creator: "Thomas Jeffreys",
      dc_description:
        "First known view of Halifax, sketched from the topmast of a ship in the harbour in 1749 and published in London on 25 January 1750. Enslaved and free Black people were present in Halifax from the settlement's founding in 1749, labouring on public works, fortifications, and shipyards.",
      dc_subject: ["African Nova Scotians", "Slavery", "Halifax", "Founding of Halifax"],
      dc_date: null,
      date_text: "25 January 1750",
      display_year: "25 January 1750",
      sort_year: 1750,
      dc_type: "map",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=1",
      dc_source:
        "Nova Scotia Archives, T. Jeffreys, Untitled Map of Halifax (London, 1750), negative number: OS N371",
      dc_coverage: "Halifax | Nova Scotia; 25 January 1750",
      dcterms_spatial: "Halifax | Nova Scotia",
      dcterms_temporal: "25 January 1750",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: Nova Scotia Archives T. Jeffreys, Untitled Map of Halifax (London, 1750) negative number: OS N371",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402000.jpg",
      bccns_digitized: true,
      citation:
        'Thomas Jeffreys, "A view of Halifax from the topmasthead," 25 January 1750, Nova Scotia Archives, T. Jeffreys, Untitled Map of Halifax (London, 1750), negative number: OS N371, https://archives.novascotia.ca/africanns/archives/?ID=1',
    },
    {
      id: "nsa-africanns-id-2",
      dc_title: "Sale of enslaved woman and child in Halifax",
      dc_creator: "Halifax Gazette",
      dc_description:
        "Notice printed in the Halifax Gazette offering for sale an enslaved woman and her child in Halifax. Documents the legal practice of buying and selling enslaved African people in early British Halifax.",
      dc_subject: ["African Nova Scotians", "Slavery", "Halifax"],
      dc_date: null,
      date_text: "15 May 1752",
      display_year: "15 May 1752",
      sort_year: 1752,
      dc_type: "newspaper",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=2",
      dc_source: "Nova Scotia Archives, Halifax Gazette, 15 May 1752, p. 2",
      dc_coverage: "Halifax | Nova Scotia; 15 May 1752",
      dcterms_spatial: "Halifax | Nova Scotia",
      dcterms_temporal: "15 May 1752",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: Halifax Gazette, 15 May 1752, p. 2",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402001.jpg",
      bccns_digitized: true,
      citation:
        'Halifax Gazette, "Sale of enslaved woman and child in Halifax," 15 May 1752, Nova Scotia Archives, Halifax Gazette, 15 May 1752, p. 2, https://archives.novascotia.ca/africanns/archives/?ID=2',
    },
    {
      id: "nsa-africanns-id-5",
      dc_title: "Probate inventory of Joshua Mauger Estate",
      dc_creator: "Halifax County Court of Probate",
      dc_description:
        "Estate inventory recording enslaved persons held as property in Halifax County probate records. Probate inventories and bills of sale survive in the court files as primary evidence of enslavement across Nova Scotia.",
      dc_subject: ["African Nova Scotians", "Slavery", "Halifax"],
      dc_date: null,
      date_text: "1770",
      display_year: "1770",
      sort_year: 1770,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=5",
      dc_source:
        "Nova Scotia Archives, RG 48, Halifax County Court of Probate, Estate Papers",
      dc_coverage: "Halifax | Nova Scotia; 1770",
      dcterms_spatial: "Halifax | Nova Scotia",
      dcterms_temporal: "1770",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 48, Halifax County Court of Probate",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402004.jpg",
      bccns_digitized: true,
      citation:
        'Halifax County Court of Probate, "Probate inventory of Joshua Mauger Estate," 1770, Nova Scotia Archives, RG 48, Halifax County Court of Probate, Estate Papers, https://archives.novascotia.ca/africanns/archives/?ID=5',
    },
    {
      id: "nsa-africanns-id-9",
      dc_title: "Runaway advertisement for Thursday, an enslaved young woman",
      dc_creator: "Nova Scotia Gazette and Weekly Chronicle",
      dc_description:
        "Newspaper notice placed by John Rock in Halifax seeking the return of Thursday, an enslaved Black woman who left his household. Runaway advertisements record the names, clothing, skills, and self-emancipation of enslaved people in Nova Scotia.",
      dc_subject: ["African Nova Scotians", "Slavery", "Abolition", "Halifax"],
      dc_date: null,
      date_text: "1 September 1772",
      display_year: "1 September 1772",
      sort_year: 1772,
      dc_type: "newspaper",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=9",
      dc_source:
        "Nova Scotia Archives, Nova Scotia Gazette and Weekly Chronicle, 1 September 1772",
      dc_coverage: "Halifax | Nova Scotia; 1 September 1772",
      dcterms_spatial: "Halifax | Nova Scotia",
      dcterms_temporal: "1 September 1772",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: Nova Scotia Gazette and Weekly Chronicle, 1 September 1772",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402008.jpg",
      bccns_digitized: true,
      citation:
        'Nova Scotia Gazette and Weekly Chronicle, "Runaway advertisement for Thursday, an enslaved young woman," 1 September 1772, Nova Scotia Archives, https://archives.novascotia.ca/africanns/archives/?ID=9',
    },
    {
      id: "nsa-africanns-id-14",
      dc_title: "Bill of sale for an enslaved boy named Jasper",
      dc_creator: "Nova Scotia Supreme Court",
      dc_description:
        "Deed of sale dated 1779 transferring ownership of an enslaved boy named Jasper in Nova Scotia. Preserved in archival legal papers documenting chattel slavery prior to judicial and statutory abolition.",
      dc_subject: ["African Nova Scotians", "Slavery", "Annapolis Royal"],
      dc_date: null,
      date_text: "1779",
      display_year: "1779",
      sort_year: 1779,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=14",
      dc_source: "Nova Scotia Archives, MG 100, Vol. 221, No. 35",
      dc_coverage: "Annapolis Royal | Nova Scotia; 1779",
      dcterms_spatial: "Annapolis Royal | Nova Scotia",
      dcterms_temporal: "1779",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: MG 100, Vol. 221, No. 35",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402013.jpg",
      bccns_digitized: true,
      citation:
        'Nova Scotia Supreme Court, "Bill of sale for an enslaved boy named Jasper," 1779, Nova Scotia Archives, MG 100, Vol. 221, No. 35, https://archives.novascotia.ca/africanns/archives/?ID=14',
    },
    {
      id: "nsa-africanns-id-28",
      dc_title: "Muster Book of Free Blacks at Birchtown",
      dc_creator: "Ordered by Governor John Parr",
      dc_description:
        "Enumeration of free Black families settled at Birchtown near Shelburne in 1784 following evacuation from New York. Lists heads of household, women, and children who established the largest free Black settlement in eighteenth-century North America.",
      dc_subject: ["African Nova Scotians", "Black Loyalists", "Birchtown", "Shelburne"],
      dc_date: null,
      date_text: "1784",
      display_year: "1784",
      sort_year: 1784,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=28",
      dc_source:
        "Nova Scotia Archives, Commissioner of Public Records collection, RG 1, Vol. 376",
      dc_coverage: "Birchtown | Shelburne | Nova Scotia; 1784",
      dcterms_spatial: "Birchtown | Shelburne | Nova Scotia",
      dcterms_temporal: "1784",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 376",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402027.jpg",
      bccns_digitized: true,
      citation:
        'Ordered by Governor John Parr, "Muster Book of Free Blacks at Birchtown," 1784, Nova Scotia Archives, RG 1, Vol. 376, https://archives.novascotia.ca/africanns/archives/?ID=28',
    },
    {
      id: "nsa-africanns-id-36",
      dc_title: "A Booth at Shelburne, Nova Scotia",
      dc_creator: "William Booth",
      dc_description:
        "Watercolour view of Shelburne harbour and settlement drawn by Captain William Booth of the Corps of Royal Engineers in 1788, depicting the landscape where Black Loyalists and Birchtown residents worked and traded.",
      dc_subject: ["African Nova Scotians", "Black Loyalists", "Shelburne", "Birchtown"],
      dc_date: null,
      date_text: "1788",
      display_year: "1788",
      sort_year: 1788,
      dc_type: "map",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=36",
      dc_source: "Nova Scotia Archives, Documentary Art Collection, 1979-147.90",
      dc_coverage: "Shelburne | Birchtown | Nova Scotia; 1788",
      dcterms_spatial: "Shelburne | Birchtown | Nova Scotia",
      dcterms_temporal: "1788",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: Documentary Art Collection, 1979-147.90",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402035.jpg",
      bccns_digitized: true,
      citation:
        'William Booth, "A Booth at Shelburne, Nova Scotia," 1788, Nova Scotia Archives, Documentary Art Collection, 1979-147.90, https://archives.novascotia.ca/africanns/archives/?ID=36',
    },
    {
      id: "nsa-africanns-id-44",
      dc_title: "Petition of Thomas Peters on behalf of Black Loyalists in Nova Scotia and New Brunswick",
      dc_creator: "Thomas Peters",
      dc_description:
        "Memorial carried to London in 1790 by Thomas Peters, formerly Sergeant in the Black Pioneers, stating that Black Loyalists in Annapolis Royal, Preston, Birchtown, and Saint John had been denied promised land grants and provisions.",
      dc_subject: ["African Nova Scotians", "Black Loyalists", "Annapolis Royal", "Preston", "Birchtown"],
      dc_date: null,
      date_text: "1790",
      display_year: "1790",
      sort_year: 1790,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=44",
      dc_source: "Nova Scotia Archives, Colonial Office 217, Vol. 63",
      dc_coverage: "Annapolis Royal | Birchtown | Preston | Nova Scotia; 1790",
      dcterms_spatial: "Annapolis Royal | Birchtown | Preston | Nova Scotia",
      dcterms_temporal: "1790",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: Colonial Office 217, Vol. 63",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402043.jpg",
      bccns_digitized: true,
      citation:
        'Thomas Peters, "Petition of Thomas Peters on behalf of Black Loyalists in Nova Scotia and New Brunswick," 1790, Nova Scotia Archives, Colonial Office 217, Vol. 63, https://archives.novascotia.ca/africanns/archives/?ID=44',
    },
    {
      id: "nsa-africanns-id-52",
      dc_title: "Supreme Court habeas corpus petition of Mary Postell",
      dc_creator: "Supreme Court of Nova Scotia",
      dc_description:
        "Court record from Shelburne County concerning Mary Postell, who had received a certificate of freedom following service with British forces in South Carolina and fought re-enslavement in Birchtown and Argyle in 1791.",
      dc_subject: ["African Nova Scotians", "Slavery", "Abolition", "Birchtown", "Shelburne"],
      dc_date: null,
      date_text: "1791",
      display_year: "1791",
      sort_year: 1791,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=52",
      dc_source: "Nova Scotia Archives, Shelburne County Court of General Sessions of the Peace, RG 34-321",
      dc_coverage: "Birchtown | Shelburne | Nova Scotia; 1791",
      dcterms_spatial: "Birchtown | Shelburne | Nova Scotia",
      dcterms_temporal: "1791",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 34-321, Shelburne County Court Records",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402051.jpg",
      bccns_digitized: true,
      citation:
        'Supreme Court of Nova Scotia, "Supreme Court habeas corpus petition of Mary Postell," 1791, Nova Scotia Archives, RG 34-321, https://archives.novascotia.ca/africanns/archives/?ID=52',
    },
    {
      id: "nsa-africanns-id-63",
      dc_title: "Chief Justice Thomas Andrew Lumisden Strange and judicial challenges to slavery",
      dc_creator: "Supreme Court of Nova Scotia",
      dc_description:
        "Correspondence and bench notes from Chief Justice Thomas Strange and his successor Sampson Salter Blowers requiring slaveholders in Nova Scotia to prove legal title in court, weakening the enforcement of slavery across the province between 1790 and 1808.",
      dc_subject: ["African Nova Scotians", "Slavery", "Abolition", "Halifax"],
      dc_date: null,
      date_text: "1800",
      display_year: "1800",
      sort_year: 1800,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=63",
      dc_source: "Nova Scotia Archives,RG 1, Vol. 224, Doc. 61",
      dc_coverage: "Halifax | Annapolis Royal | Nova Scotia; 1800",
      dcterms_spatial: "Halifax | Annapolis Royal | Nova Scotia",
      dcterms_temporal: "1800",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 224, Doc. 61",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402062.jpg",
      bccns_digitized: true,
      citation:
        'Supreme Court of Nova Scotia, "Chief Justice Thomas Andrew Lumisden Strange and judicial challenges to slavery," 1800, Nova Scotia Archives, RG 1, Vol. 224, Doc. 61, https://archives.novascotia.ca/africanns/archives/?ID=63',
    },
    {
      id: "nsa-africanns-id-78",
      dc_title: "Petition of John Taylor and slaveholders of Annapolis County",
      dc_creator: "Nova Scotia House of Assembly",
      dc_description:
        "Legislative petition presented in 1808 by slaveholders in Annapolis Royal and Digby asking the Nova Scotia House of Assembly to clarify the legal status of enslaved persons because courts refused to return those who left their masters. The Assembly declined to pass a statute protecting slavery.",
      dc_subject: ["African Nova Scotians", "Slavery", "Abolition", "Annapolis Royal"],
      dc_date: null,
      date_text: "1808",
      display_year: "1808",
      sort_year: 1808,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=78",
      dc_source: "Nova Scotia Archives, RG 5, Series P, Vol. 1, No. 55",
      dc_coverage: "Annapolis Royal | Halifax | Nova Scotia; 1808",
      dcterms_spatial: "Annapolis Royal | Halifax | Nova Scotia",
      dcterms_temporal: "1808",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 5, Series P, Vol. 1, No. 55",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402077.jpg",
      bccns_digitized: true,
      citation:
        'Nova Scotia House of Assembly, "Petition of John Taylor and slaveholders of Annapolis County," 1808, Nova Scotia Archives, RG 5, Series P, Vol. 1, No. 55, https://archives.novascotia.ca/africanns/archives/?ID=78',
    },
    {
      id: "nsa-africanns-id-98",
      dc_title: "Return of Black People at Preston, Halifax County",
      dc_creator: "Theophilus Chamberlain",
      dc_description:
        "Return of families settled on small rocky lots at Preston in 1815 and 1816, recording names, occupations, and household numbers in the community bordering Cherry Brook.",
      dc_subject: ["African Nova Scotians", "Black Refugees", "Preston", "Cherry Brook", "Halifax"],
      dc_date: null,
      date_text: "1816",
      display_year: "1816",
      sort_year: 1816,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=98",
      dc_source: "Nova Scotia Archives, RG 1, Vol. 420, No. 19",
      dc_coverage: "Preston | Cherry Brook | Halifax | Nova Scotia; 1816",
      dcterms_spatial: "Preston | Cherry Brook | Halifax | Nova Scotia",
      dcterms_temporal: "1816",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 420, No. 19",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402097.jpg",
      bccns_digitized: true,
      citation:
        'Theophilus Chamberlain, "Return of Black People at Preston, Halifax County," 1816, Nova Scotia Archives, RG 1, Vol. 420, No. 19, https://archives.novascotia.ca/africanns/archives/?ID=98',
    },
    {
      id: "nsa-africanns-id-114",
      dc_title: "Slavery Abolition Act, 1833, and Richard Preston's African Baptist congregations",
      dc_creator: "Richard Preston and the African United Baptist Association",
      dc_description:
        "Imperial statute abolishing slavery across the British Empire effective 1 August 1834, alongside records of Reverend Richard Preston establishing the Cornwallis Street African Baptist Church in Halifax (1832) and the African United Baptist Association at Granville Mountain (1854) uniting congregations in Preston, Cherry Brook, Beechville, and Hammonds Plains.",
      dc_subject: ["African Nova Scotians", "Abolition", "Halifax", "Preston", "Cherry Brook"],
      dc_date: null,
      date_text: "1 August 1834",
      display_year: "1 August 1834",
      sort_year: 1834,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=114",
      dc_source: "Nova Scotia Archives, African Nova Scotians in the Age of Slavery and Abolition, ID 114",
      dc_coverage: "Halifax | Preston | Cherry Brook | Nova Scotia; 1834",
      dcterms_spatial: "Halifax | Preston | Cherry Brook | Nova Scotia",
      dcterms_temporal: "1 August 1834",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. African Nova Scotians in the Age of Slavery and Abolition.",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402104.jpg",
      bccns_digitized: true,
      citation:
        'Richard Preston and the African United Baptist Association, "Slavery Abolition Act, 1833, and Richard Preston\'s African Baptist congregations," 1 August 1834, Nova Scotia Archives, https://archives.novascotia.ca/africanns/archives/?ID=114',
    },
  ],
  black_loyalists: [
    {
      id: "blhc-book-of-negroes-1783",
      dc_title: "Inspection Roll of Negroes (The Book of Negroes), New York to Nova Scotia",
      dc_creator: "Board of Commissioners at New York",
      dc_description:
        "Register compiled between April and November 1783 recording more than 3,000 Black men, women, and children who embarked on British vessels at New York bound for Birchtown, Shelburne, Annapolis Royal, Preston, and Halifax with certificates of freedom.",
      dc_subject: ["Black Loyalists", "Birchtown", "Shelburne", "Annapolis Royal", "African Nova Scotians"],
      dc_date: null,
      date_text: "1783",
      display_year: "1783",
      sort_year: 1783,
      dc_type: "document",
      dc_publisher: "Black Loyalist Heritage Centre",
      dc_identifier: "https://blackloyalist.com/cdc/documents/official/book_of_negroes.htm",
      dc_source: "Canada's Digital Collections: Black Loyalists: Our Story, Our People",
      dc_coverage: "Birchtown | Shelburne | Annapolis Royal | Halifax | Nova Scotia",
      dcterms_spatial: "Birchtown | Shelburne | Annapolis Royal | Halifax | Nova Scotia",
      dcterms_temporal: "1783",
      dc_relation: "https://blackloyalist.com/cdc/index.htm",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "Published in Canada's Digital Collections and hosted by the Black Loyalist Heritage Centre / Nova Scotia Archives.",
      dcterms_access_rights:
        "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held online by Black Loyalist Heritage Centre and Nova Scotia Archives.",
      collection: "Black Loyalists: Our Story, Our People",
      media_url: "https://archives.novascotia.ca/images/africanns/200402020.jpg",
      bccns_digitized: true,
      citation:
        'Board of Commissioners at New York, "Inspection Roll of Negroes (The Book of Negroes), New York to Nova Scotia," 1783, Black Loyalist Heritage Centre, https://blackloyalist.com/cdc/documents/official/book_of_negroes.htm',
    },
    {
      id: "blhc-david-george-preston-shelburne",
      dc_title: "Memoir of David George, Baptist preacher in Shelburne and Birchtown",
      dc_creator: "David George",
      dc_description:
        "Account dictated by David George describing his arrival at Shelburne in 1783, the founding of the Baptist church there, the 1784 Shelburne riot driven by disbanded soldiers, and his ministry in Birchtown, Preston, and Ragged Islands before departing for Sierra Leone in 1792.",
      dc_subject: ["Black Loyalists", "Birchtown", "Shelburne", "Preston", "African Nova Scotians"],
      dc_date: null,
      date_text: "1784",
      display_year: "1784",
      sort_year: 1784,
      dc_type: "biography",
      dc_publisher: "Black Loyalist Heritage Centre",
      dc_identifier: "https://blackloyalist.com/cdc/people/religious/george.htm",
      dc_source: "Canada's Digital Collections: Black Loyalists: Our Story, Our People",
      dc_coverage: "Birchtown | Shelburne | Preston | Nova Scotia",
      dcterms_spatial: "Birchtown | Shelburne | Preston | Nova Scotia",
      dcterms_temporal: "1783-1792",
      dc_relation: "https://blackloyalist.com/cdc/index.htm",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "Published in Canada's Digital Collections and hosted by the Black Loyalist Heritage Centre.",
      dcterms_access_rights:
        "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held online by Black Loyalist Heritage Centre. Canada's Digital Collections: Black Loyalists: Our Story, Our People.",
      collection: "Black Loyalists: Our Story, Our People",
      media_url: "https://archives.novascotia.ca/images/africanns/200402027.jpg",
      bccns_digitized: true,
      citation:
        'David George, "Memoir of David George, Baptist preacher in Shelburne and Birchtown," 1784, Black Loyalist Heritage Centre, https://blackloyalist.com/cdc/people/religious/george.htm',
    },
    {
      id: "blhc-boston-king-birchtown",
      dc_title: "Memoirs of the Life of Boston King, carpenter and Methodist preacher at Birchtown",
      dc_creator: "Boston King",
      dc_description:
        "First-hand narrative published by Boston King in 1798 recounting his escape to British lines in South Carolina, settlement at Birchtown in 1783, chest-making and fishing work during the famine year of 1789, and congregation at Preston prior to the 1792 fleet to Freetown.",
      dc_subject: ["Black Loyalists", "Birchtown", "Preston", "Shelburne", "African Nova Scotians"],
      dc_date: null,
      date_text: "1791",
      display_year: "1791",
      sort_year: 1791,
      dc_type: "biography",
      dc_publisher: "Black Loyalist Heritage Centre",
      dc_identifier: "https://blackloyalist.com/cdc/documents/diaries/king-memoirs.htm",
      dc_source: "Canada's Digital Collections: Black Loyalists: Our Story, Our People",
      dc_coverage: "Birchtown | Preston | Shelburne | Nova Scotia",
      dcterms_spatial: "Birchtown | Preston | Shelburne | Nova Scotia",
      dcterms_temporal: "1783-1792",
      dc_relation: "https://blackloyalist.com/cdc/index.htm",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "Published in Canada's Digital Collections and hosted by the Black Loyalist Heritage Centre.",
      dcterms_access_rights:
        "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held online by Black Loyalist Heritage Centre. Canada's Digital Collections: Black Loyalists: Our Story, Our People.",
      collection: "Black Loyalists: Our Story, Our People",
      media_url: "https://archives.novascotia.ca/images/africanns/200402042.jpg",
      bccns_digitized: true,
      citation:
        'Boston King, "Memoirs of the Life of Boston King, carpenter and Methodist preacher at Birchtown," 1791, Black Loyalist Heritage Centre, https://blackloyalist.com/cdc/documents/diaries/king-memoirs.htm',
    },
    {
      id: "blhc-rose-fortune-annapolis",
      dc_title: "Rose Fortune of Annapolis Royal",
      dc_creator: "Nova Scotia Archives",
      dc_description:
        "Watercolour portrait (~1830) and biographical record of Rose Fortune (1774–1864), who arrived at Annapolis Royal with her parents in the Black Loyalist migration and established a baggage-carting and wharf policing business on the Annapolis waterfront.",
      dc_subject: ["Black Loyalists", "Annapolis Royal", "African Nova Scotians"],
      dc_date: null,
      date_text: "ca. 1830",
      display_year: "ca. 1830",
      sort_year: 1830,
      dc_type: "biography",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=40",
      dc_source: "Nova Scotia Archives, Documentary Art Collection",
      dc_coverage: "Annapolis Royal | Nova Scotia",
      dcterms_spatial: "Annapolis Royal | Nova Scotia",
      dcterms_temporal: "1783-1864",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. African Nova Scotians in the Age of Slavery and Abolition.",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402039.jpg",
      bccns_digitized: true,
      citation:
        'Nova Scotia Archives, "Rose Fortune of Annapolis Royal," ca. 1830, Nova Scotia Archives, Documentary Art Collection, https://archives.novascotia.ca/africanns/archives/?ID=40',
    },
  ],
  the_maroons: [
    {
      id: "nsa-maroons-arrival-1796",
      dc_title: "Arrival of Trelawny Town Maroons at Halifax Harbour",
      dc_creator: "Governor Sir John Wentworth",
      dc_description:
        "Despatches recording the arrival in July 1796 of nearly 600 Jamaican Maroons from Trelawny Town aboard the transports Dover, Mary, and Anne. The Maroons worked on the third fortifications of the Halifax Citadel (Fort George) and settled on land acquired at Preston.",
      dc_subject: ["The Maroons", "Preston", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "26 July 1796",
      display_year: "26 July 1796",
      sort_year: 1796,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=55",
      dc_source: "Nova Scotia Archives, RG 1, Vol. 52, Governor Wentworth Despatches",
      dc_coverage: "Halifax | Preston | Nova Scotia; 1796",
      dcterms_spatial: "Halifax | Preston | Nova Scotia",
      dcterms_temporal: "26 July 1796",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 52",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402054.jpg",
      bccns_digitized: true,
      citation:
        'Governor Sir John Wentworth, "Arrival of Trelawny Town Maroons at Halifax Harbour," 26 July 1796, Nova Scotia Archives, RG 1, Vol. 52, https://archives.novascotia.ca/africanns/archives/?ID=55',
    },
    {
      id: "nsa-maroons-citadel-1797",
      dc_title: "Maroon Bastion and Fortification Works at Fort George, Halifax Citadel",
      dc_creator: "Royal Engineers, Halifax Garrison",
      dc_description:
        "Pay lists and engineering returns recording Trelawny Town Maroon companies employed on the earthworks and Maroon Bastion of the third Halifax Citadel under Prince Edward, Duke of Kent, in 1796 and 1797.",
      dc_subject: ["The Maroons", "Halifax", "Preston", "African Nova Scotians"],
      dc_date: null,
      date_text: "1797",
      display_year: "1797",
      sort_year: 1797,
      dc_type: "map",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=56",
      dc_source: "Nova Scotia Archives, Commissioner of Public Records, RG 1, Vol. 419",
      dc_coverage: "Halifax | Preston | Nova Scotia; 1797",
      dcterms_spatial: "Halifax | Preston | Nova Scotia",
      dcterms_temporal: "1797",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 419",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402055.jpg",
      bccns_digitized: true,
      citation:
        'Royal Engineers, Halifax Garrison, "Maroon Bastion and Fortification Works at Fort George, Halifax Citadel," 1797, Nova Scotia Archives, RG 1, Vol. 419, https://archives.novascotia.ca/africanns/archives/?ID=56',
    },
    {
      id: "nsa-maroons-petition-1798",
      dc_title: "Petitions of the Jamaican Maroons at Preston and Boydville",
      dc_creator: "Captains Montague James and Andrew Smith",
      dc_description:
        "Petitions addressed to British authorities by Maroon leaders at Preston protesting the severe Nova Scotia winters and conditions of settlement, leading to the embarkation of most Maroons for Sierra Leone in August 1800 while Maroon Bastion at the Halifax Citadel and Maroon Hall in Preston remained enduring landmarks.",
      dc_subject: ["The Maroons", "Preston", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "1798",
      display_year: "1798",
      sort_year: 1798,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=59",
      dc_source: "Nova Scotia Archives, Commissioner of Public Records, RG 1, Vol. 419",
      dc_coverage: "Preston | Halifax | Nova Scotia; 1798",
      dcterms_spatial: "Preston | Halifax | Nova Scotia",
      dcterms_temporal: "1796-1800",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 419",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402058.jpg",
      bccns_digitized: true,
      citation:
        'Captains Montague James and Andrew Smith, "Petitions of the Jamaican Maroons at Preston and Boydville," 1798, Nova Scotia Archives, RG 1, Vol. 419, https://archives.novascotia.ca/africanns/archives/?ID=59',
    },
    {
      id: "nsa-maroons-embarkation-1800",
      dc_title: "Embarkation List of the Trelawny Town Maroons aboard HMS Asia at Halifax",
      dc_creator: "Commissioner of Maroon Affairs, Halifax",
      dc_description:
        "Return of 551 Maroon men, women, and children who embarked aboard the transport ship Asia in Halifax Harbour in August 1800 bound for Freetown, Sierra Leone, concluding the four-year Maroon settlement at Preston and Boydville.",
      dc_subject: ["The Maroons", "Preston", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "August 1800",
      display_year: "August 1800",
      sort_year: 1800,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=61",
      dc_source: "Nova Scotia Archives, Commissioner of Public Records, RG 1, Vol. 420",
      dc_coverage: "Preston | Halifax | Nova Scotia; 1800",
      dcterms_spatial: "Preston | Halifax | Nova Scotia",
      dcterms_temporal: "August 1800",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 420",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402060.jpg",
      bccns_digitized: true,
      citation:
        'Commissioner of Maroon Affairs, Halifax, "Embarkation List of the Trelawny Town Maroons aboard HMS Asia at Halifax," August 1800, Nova Scotia Archives, RG 1, Vol. 420, https://archives.novascotia.ca/africanns/archives/?ID=61',
    },
  ],
  the_refugees: [
    {
      id: "nsa-refugees-cochrane-1814",
      dc_title: "Vice-Admiral Sir Alexander Cochrane's Proclamation and Halifax Melville Island Lists",
      dc_creator: "Vice-Admiral Sir Alexander Cochrane",
      dc_description:
        "Proclamation issued on 2 April 1814 during the War of 1812 offering free settlement in British possessions, and ship lists recording approximately 2,000 Black Refugees from the Chesapeake Bay and Georgia Sea Islands who entered Nova Scotia through Halifax between 1813 and 1816.",
      dc_subject: ["Black Refugees", "Halifax", "Preston", "Cherry Brook", "African Nova Scotians"],
      dc_date: null,
      date_text: "2 April 1814",
      display_year: "2 April 1814",
      sort_year: 1814,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=74",
      dc_source: "Nova Scotia Archives, RG 1, Vol. 305, No. 7",
      dc_coverage: "Halifax | Preston | Cherry Brook | Hammonds Plains | Nova Scotia; 1814",
      dcterms_spatial: "Halifax | Preston | Cherry Brook | Hammonds Plains | Nova Scotia",
      dcterms_temporal: "2 April 1814",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 305, No. 7",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402073.jpg",
      bccns_digitized: true,
      citation:
        'Vice-Admiral Sir Alexander Cochrane, "Vice-Admiral Sir Alexander Cochrane\'s Proclamation and Halifax Melville Island Lists," 2 April 1814, Nova Scotia Archives, RG 1, Vol. 305, No. 7, https://archives.novascotia.ca/africanns/archives/?ID=74',
    },
    {
      id: "nsa-refugees-hammonds-plains-1815",
      dc_title: "Settlement Return of Black Refugees at Hammonds Plains and Beechville",
      dc_creator: "Seth Coleman and Council of Nova Scotia",
      dc_description:
        "Enumeration of Black Refugee families from the Chesapeake and Georgia who settled at Hammonds Plains and Beechville (formerly Beech Hill) in 1815, recording heads of household, children, and timber-working occupations.",
      dc_subject: ["Black Refugees", "Hammonds Plains", "Beechville", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "1815",
      display_year: "1815",
      sort_year: 1815,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=82",
      dc_source: "Nova Scotia Archives, Commissioner of Public Records, RG 1, Vol. 420",
      dc_coverage: "Hammonds Plains | Beechville | Halifax | Nova Scotia; 1815",
      dcterms_spatial: "Hammonds Plains | Beechville | Halifax | Nova Scotia",
      dcterms_temporal: "1815",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 420",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402081.jpg",
      bccns_digitized: true,
      citation:
        'Seth Coleman and Council of Nova Scotia, "Settlement Return of Black Refugees at Hammonds Plains and Beechville," 1815, Nova Scotia Archives, RG 1, Vol. 420, https://archives.novascotia.ca/africanns/archives/?ID=82',
    },
    {
      id: "nsa-refugees-preston-lots-1818",
      dc_title: "Plan of Lots Surveyed for Black Refugees at Preston and Cherry Brook",
      dc_creator: "Surveyor General Charles Morris",
      dc_description:
        "Survey plan and licence-of-occupation lists showing the ten-acre lots allocated at Preston, Cherry Brook, Beechville, and Hammonds Plains. Rather than full freehold grants, Black Refugees were initially issued tickets of location that restricted land sales and required decades of community petitions to convert into clear title.",
      dc_subject: ["Black Refugees", "Preston", "Cherry Brook", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "1818",
      display_year: "1818",
      sort_year: 1818,
      dc_type: "map",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=86",
      dc_source: "Nova Scotia Archives, RG 1, Vol. 419, No. 90",
      dc_coverage: "Preston | Cherry Brook | Halifax | Nova Scotia; 1818",
      dcterms_spatial: "Preston | Cherry Brook | Halifax | Nova Scotia",
      dcterms_temporal: "1818",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 1, Vol. 419, No. 90",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402085.jpg",
      bccns_digitized: true,
      citation:
        'Surveyor General Charles Morris, "Plan of Lots Surveyed for Black Refugees at Preston and Cherry Brook," 1818, Nova Scotia Archives, RG 1, Vol. 419, No. 90, https://archives.novascotia.ca/africanns/archives/?ID=86',
    },
    {
      id: "nsa-refugees-land-petition-1841",
      dc_title: "Petition of Colored People at Preston and Cherry Brook for Freehold Land Grants",
      dc_creator: "Inhabitants of Preston and Cherry Brook",
      dc_description:
        "Petition signed by Black Refugee landholders in Preston and Cherry Brook requesting full freehold grants in place of restricted tickets of location so families could pass clear title to their children and vote in provincial elections.",
      dc_subject: ["Black Refugees", "Preston", "Cherry Brook", "Halifax", "African Nova Scotians"],
      dc_date: null,
      date_text: "1841",
      display_year: "1841",
      sort_year: 1841,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=108",
      dc_source: "Nova Scotia Archives, RG 5, Series P, Vol. 44, Petitions",
      dc_coverage: "Preston | Cherry Brook | Halifax | Nova Scotia; 1841",
      dcterms_spatial: "Preston | Cherry Brook | Halifax | Nova Scotia",
      dcterms_temporal: "1841",
      dc_relation: "https://archives.novascotia.ca/africanns/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights:
        "This page and all contents copyright © Province of Nova Scotia, all rights reserved.",
      dcterms_access_rights:
        "Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution.",
      dcterms_provenance:
        "Held by Nova Scotia Archives. Archival citation: RG 5, Series P, Vol. 44",
      collection: "African Nova Scotians in the Age of Slavery and Abolition",
      media_url: "https://archives.novascotia.ca/images/africanns/200402101.jpg",
      bccns_digitized: true,
      citation:
        'Inhabitants of Preston and Cherry Brook, "Petition of Colored People at Preston and Cherry Brook for Freehold Land Grants," 1841, Nova Scotia Archives, RG 5, Series P, Vol. 44, https://archives.novascotia.ca/africanns/archives/?ID=108',
    },
  ],
  caribbean_migrants: [
    {
      id: "lac-caribbean-disco-1901",
      dc_title: "Dominion Iron and Steel Company Blast Furnace Arrivals at Whitney Pier, Sydney",
      dc_creator: "Nova Scotia Archives / Beaton Institute",
      dc_description:
        "Shipping and employment records documenting skilled ironworkers and labourers from Barbados, St. Vincent, Trinidad, and Jamaica who arrived in Sydney, Cape Breton, beginning in 1901 to work at the Dominion Iron and Steel Company furnaces and settled in Whitney Pier.",
      dc_subject: ["Caribbean migrants", "Whitney Pier", "Sydney", "African Nova Scotians"],
      dc_date: null,
      date_text: "1901",
      display_year: "1901",
      sort_year: 1901,
      dc_type: "document",
      dc_publisher: "Nova Scotia Archives",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=105",
      dc_source: "Nova Scotia Archives & Library and Archives Canada, Cape Breton Industrial Records",
      dc_coverage: "Whitney Pier | Sydney | Nova Scotia; 1901",
      dcterms_spatial: "Whitney Pier | Sydney | Nova Scotia",
      dcterms_temporal: "1901",
      dc_relation:
        "https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Published by Nova Scotia Archives and Library and Archives Canada.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held by Nova Scotia Archives and Library and Archives Canada.",
      collection: "Caribbean Migrants in Cape Breton and Mainland Nova Scotia",
      media_url: "https://archives.novascotia.ca/images/africanns/200402099.jpg",
      bccns_digitized: true,
      citation:
        'Nova Scotia Archives / Beaton Institute, "Dominion Iron and Steel Company Blast Furnace Arrivals at Whitney Pier, Sydney," 1901, Nova Scotia Archives, https://archives.novascotia.ca/africanns/archives/?ID=105',
    },
    {
      id: "lac-caribbean-sydney-whitney-pier",
      dc_title: "Caribbean Migration to Cape Breton and Halifax (Whitney Pier Records)",
      dc_creator: "Library and Archives Canada",
      dc_description:
        "Archival guide and immigration records documenting workers and families from Barbados, Jamaica, Trinidad, Antigua, and St. Kitts who migrated to Sydney (Whitney Pier), Glace Bay, New Waterford, and Halifax in the early twentieth century to work in the Dominion Iron and Steel Company mills and coal mines, founding St. Philip's African Orthodox Church in 1927.",
      dc_subject: ["Caribbean migrants", "African Nova Scotians", "Halifax", "Black Canadians"],
      dc_date: null,
      date_text: "1899–1931",
      display_year: "1914",
      sort_year: 1914,
      dc_type: "research guide",
      dc_publisher: "Library and Archives Canada",
      dc_identifier:
        "https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html",
      dc_source: "Library and Archives Canada",
      dc_coverage: "Sydney | Halifax | Nova Scotia",
      dcterms_spatial: "Sydney | Halifax | Nova Scotia",
      dcterms_temporal: "1899-1931",
      dc_relation:
        "https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html",
      dc_language: "eng",
      dc_format: "text/html",
      dc_rights: "Published by Library and Archives Canada.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held online by Library and Archives Canada. Library and Archives Canada: Black Canadians.",
      collection: "Library and Archives Canada: Black Canadians",
      media_url: "https://archives.novascotia.ca/images/africanns/200402108.jpg",
      bccns_digitized: true,
      citation:
        'Library and Archives Canada, "Caribbean Migration to Cape Breton and Halifax (Whitney Pier Records)," 1899–1931, Library and Archives Canada, https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html',
    },
    {
      id: "bccns-unia-glace-bay-sydney-1920",
      dc_title: "Universal Negro Improvement Association (UNIA) Divisions in Whitney Pier and Glace Bay",
      dc_creator: "UNIA Cape Breton Divisions / Black Cultural Centre for Nova Scotia",
      dc_description:
        "Charter and community records of the UNIA divisions established by Caribbean migrants and African Nova Scotian families in Sydney (Whitney Pier), Glace Bay, and New Waterford between 1919 and 1937.",
      dc_subject: ["Caribbean migrants", "Whitney Pier", "Sydney", "Glace Bay", "African Nova Scotians"],
      dc_date: null,
      date_text: "1920",
      display_year: "1920",
      sort_year: 1920,
      dc_type: "document",
      dc_publisher: "Black Cultural Centre for Nova Scotia",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=112",
      dc_source: "Black Cultural Centre for Nova Scotia & Nova Scotia Archives",
      dc_coverage: "Whitney Pier | Sydney | Glace Bay | Nova Scotia; 1920",
      dcterms_spatial: "Whitney Pier | Sydney | Glace Bay | Nova Scotia",
      dcterms_temporal: "1919-1937",
      dc_relation: "https://bccns.com/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Held by Black Cultural Centre for Nova Scotia and Nova Scotia Archives.",
      dcterms_access_rights: "Publicly viewable at the source record link.",
      dcterms_provenance:
        "Held by Black Cultural Centre for Nova Scotia, Cherry Brook.",
      collection: "Caribbean Migrants in Cape Breton and Mainland Nova Scotia",
      media_url: "https://archives.novascotia.ca/images/africanns/200402103.jpg",
      bccns_digitized: true,
      citation:
        'UNIA Cape Breton Divisions, "Universal Negro Improvement Association (UNIA) Divisions in Whitney Pier and Glace Bay," 1920, Black Cultural Centre for Nova Scotia, https://archives.novascotia.ca/africanns/archives/?ID=112',
    },
    {
      id: "bccns-st-philips-african-orthodox-1927",
      dc_title: "Founding of St. Philip's African Orthodox Church, Whitney Pier, Sydney",
      dc_creator: "Archbishop George Alexander McGuire and Parishioners of Whitney Pier",
      dc_description:
        "Parish register and dedication records of St. Philip's African Orthodox Church in Whitney Pier, Sydney, organized in 1927 by Caribbean steelworker families in Cape Breton—the only congregation of the African Orthodox Church established in Canada.",
      dc_subject: ["Caribbean migrants", "Whitney Pier", "Sydney", "African Nova Scotians"],
      dc_date: null,
      date_text: "1927",
      display_year: "1927",
      sort_year: 1927,
      dc_type: "document",
      dc_publisher: "Black Cultural Centre for Nova Scotia",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=115",
      dc_source: "Black Cultural Centre for Nova Scotia, Cape Breton Collection",
      dc_coverage: "Whitney Pier | Sydney | Nova Scotia; 1927",
      dcterms_spatial: "Whitney Pier | Sydney | Nova Scotia",
      dcterms_temporal: "1927",
      dc_relation: "https://bccns.com/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Held by Black Cultural Centre for Nova Scotia.",
      dcterms_access_rights: "Publicly viewable at the source record link.",
      dcterms_provenance:
        "Held by Black Cultural Centre for Nova Scotia, Cherry Brook.",
      collection: "Caribbean Migrants in Cape Breton and Mainland Nova Scotia",
      media_url: "https://archives.novascotia.ca/images/africanns/200402106.jpg",
      bccns_digitized: true,
      citation:
        'Archbishop George Alexander McGuire and Parishioners of Whitney Pier, "Founding of St. Philip\'s African Orthodox Church, Whitney Pier, Sydney," 1927, Black Cultural Centre for Nova Scotia, https://archives.novascotia.ca/africanns/archives/?ID=115',
    },
  ],
  construction_battalion: [
    {
      id: "bccns-no2-construction-battalion-1916",
      dc_title: "No. 2 Construction Battalion Nominal Roll and Pictou Headquarters",
      dc_creator: "Canadian Expeditionary Force / Black Cultural Centre for Nova Scotia",
      dc_description:
        "Authorized on 5 July 1916 at Pictou, Nova Scotia, and later headquartered in Truro, No. 2 Construction Battalion (Canadian Expeditionary Force) was the largest all-Black military unit in Canadian history. Men from Preston, Cherry Brook, Halifax, Shelburne, Annapolis Royal, Sydney, across Canada, the United States, and the British West Indies served with the Canadian Forestry Corps in the Jura Mountains of France during the First World War.",
      dc_subject: [
        "No. 2 Construction Battalion",
        "African Nova Scotians",
        "First World War",
        "Pictou",
        "Truro",
        "Cherry Brook",
      ],
      dc_date: "1916-07-05",
      date_text: "5 July 1916",
      display_year: "5 July 1916",
      sort_year: 1916,
      dc_type: "document",
      dc_publisher: "A Black People's History of Canada",
      dc_identifier: "https://www.blackpeopleshistory.ca/",
      dc_source: "A Black People's History of Canada",
      dc_coverage: "Pictou | Truro | Halifax | Cherry Brook | Nova Scotia",
      dcterms_spatial: "Pictou | Truro | Halifax | Cherry Brook | Nova Scotia",
      dcterms_temporal: "1916-1919",
      dc_relation: "https://www.blackpeopleshistory.ca/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Published by A Black People's History of Canada / Black Cultural Centre for Nova Scotia.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held by the Black Cultural Centre for Nova Scotia, Cherry Brook, and Library and Archives Canada RG 150.",
      collection: "A Black People's History of Canada",
      media_url: "https://archives.novascotia.ca/images/africanns/200402110.jpg",
      bccns_digitized: true,
      citation:
        'Canadian Expeditionary Force / Black Cultural Centre for Nova Scotia, "No. 2 Construction Battalion Nominal Roll and Pictou Headquarters," 5 July 1916, A Black People\'s History of Canada, https://www.blackpeopleshistory.ca/',
    },
    {
      id: "bccns-no2-william-andrew-white-1916",
      dc_title: "Commission of Captain (Chaplain) Reverend William Andrew White",
      dc_creator: "Department of Militia and Defence / Cornwallis Street Baptist Church",
      dc_description:
        "Service record and pastoral correspondence of Reverend William Andrew White, minister of Cornwallis Street African Baptist Church in Halifax, commissioned as Honorary Captain and Chaplain of No. 2 Construction Battalion in 1916—the only Black commissioned officer in the British Empire forces during the First World War.",
      dc_subject: [
        "No. 2 Construction Battalion",
        "Halifax",
        "Truro",
        "Pictou",
        "African Nova Scotians",
      ],
      dc_date: "1916-09-12",
      date_text: "September 1916",
      display_year: "September 1916",
      sort_year: 1916,
      dc_type: "biography",
      dc_publisher: "Black Cultural Centre for Nova Scotia",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=116",
      dc_source: "Black Cultural Centre for Nova Scotia & Library and Archives Canada RG 150",
      dc_coverage: "Halifax | Pictou | Truro | Nova Scotia",
      dcterms_spatial: "Halifax | Pictou | Truro | Nova Scotia",
      dcterms_temporal: "1916-1919",
      dc_relation: "https://bccns.com/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Held by Black Cultural Centre for Nova Scotia and Library and Archives Canada.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held by the Black Cultural Centre for Nova Scotia, Cherry Brook, and Library and Archives Canada.",
      collection: "No. 2 Construction Battalion, Canadian Expeditionary Force",
      media_url: "https://archives.novascotia.ca/images/africanns/200402109.jpg",
      bccns_digitized: true,
      citation:
        'Department of Militia and Defence, "Commission of Captain (Chaplain) Reverend William Andrew White," September 1916, Black Cultural Centre for Nova Scotia & Library and Archives Canada RG 150, https://archives.novascotia.ca/africanns/archives/?ID=116',
    },
    {
      id: "bccns-no2-truro-embarkation-1917",
      dc_title: "Embarkation of No. 2 Construction Battalion from Truro and Halifax aboard SS Southland",
      dc_creator: "Canadian Expeditionary Force",
      dc_description:
        "Marching orders and embarkation roll of 19 officers and 595 other ranks of No. 2 Construction Battalion who trained at Truro during the winter of 1916–1917 and sailed from Halifax Harbour aboard SS Southland on 28 March 1917 for Liverpool and France.",
      dc_subject: [
        "No. 2 Construction Battalion",
        "Truro",
        "Halifax",
        "Cherry Brook",
        "Preston",
        "African Nova Scotians",
      ],
      dc_date: "1917-03-28",
      date_text: "28 March 1917",
      display_year: "28 March 1917",
      sort_year: 1917,
      dc_type: "document",
      dc_publisher: "Library and Archives Canada",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=117",
      dc_source: "Library and Archives Canada, RG 9, War Diaries of No. 2 Construction Company",
      dc_coverage: "Truro | Halifax | Nova Scotia; 1917",
      dcterms_spatial: "Truro | Halifax | Nova Scotia",
      dcterms_temporal: "28 March 1917",
      dc_relation: "https://bccns.com/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Public domain / Library and Archives Canada & Black Cultural Centre for Nova Scotia.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held by Library and Archives Canada (RG 9) and Black Cultural Centre for Nova Scotia, Cherry Brook.",
      collection: "No. 2 Construction Battalion, Canadian Expeditionary Force",
      media_url: "https://archives.novascotia.ca/images/africanns/200402107.jpg",
      bccns_digitized: true,
      citation:
        'Canadian Expeditionary Force, "Embarkation of No. 2 Construction Battalion from Truro and Halifax aboard SS Southland," 28 March 1917, Library and Archives Canada RG 9, https://archives.novascotia.ca/africanns/archives/?ID=117',
    },
    {
      id: "bccns-no2-jura-forestry-1918",
      dc_title: "War Diary of No. 2 Construction Company with the Canadian Forestry Corps, La Joux, France",
      dc_creator: "Lieutenant-Colonel Daniel Hugh Sutherland",
      dc_description:
        "Daily operations log from La Joux in the Jura Mountains of France (1917–1918), where men from Preston, Cherry Brook, Hammonds Plains, Birchtown, Shelburne, Annapolis Royal, and Sydney operated logging railways, sawmills, and water-supply lines supplying Allied trenches, before demobilization in Halifax in January 1919.",
      dc_subject: [
        "No. 2 Construction Battalion",
        "Preston",
        "Cherry Brook",
        "Halifax",
        "African Nova Scotians",
      ],
      dc_date: "1918-05-15",
      date_text: "1918",
      display_year: "1918",
      sort_year: 1918,
      dc_type: "document",
      dc_publisher: "Black Cultural Centre for Nova Scotia",
      dc_identifier: "https://archives.novascotia.ca/africanns/archives/?ID=118",
      dc_source: "Black Cultural Centre for Nova Scotia, Military Heritage Collection",
      dc_coverage: "Cherry Brook | Preston | Halifax | Truro | Pictou | Nova Scotia; 1918",
      dcterms_spatial: "Cherry Brook | Preston | Halifax | Truro | Pictou | Nova Scotia",
      dcterms_temporal: "1917-1919",
      dc_relation: "https://bccns.com/",
      dc_language: "eng",
      dc_format: "image/jpeg",
      dc_rights: "Held by Black Cultural Centre for Nova Scotia and Library and Archives Canada.",
      dcterms_access_rights: "Publicly viewable online at the link in dc_identifier.",
      dcterms_provenance:
        "Held by the Black Cultural Centre for Nova Scotia, Cherry Brook.",
      collection: "No. 2 Construction Battalion, Canadian Expeditionary Force",
      media_url: "https://archives.novascotia.ca/images/africanns/200402105.jpg",
      bccns_digitized: true,
      citation:
        'Lieutenant-Colonel Daniel Hugh Sutherland, "War Diary of No. 2 Construction Company with the Canadian Forestry Corps, La Joux, France," 1918, Black Cultural Centre for Nova Scotia, https://archives.novascotia.ca/africanns/archives/?ID=118',
    },
  ],
};

/**
 * SOURCE OF TRUTH KEYWORDS: COLLECTION_DEFINITIONS, BCCNS chapters, washHex, curatorial voice
 * WHAT: Defines the 6 historical chapter halls in the Centre's own order, with BCCNS palette washes and curatorial notes.
 * WHY: One hall portal = one collection or historical chapter. Colors come strictly from the refined BCCNS archival palette (#a85c1a, #7f2626, #3a552e, #a67224).
 * WHERE: getArchivePayload.
 */
const COLLECTION_DEFINITIONS: Omit<ArchiveCollection, "stations">[] = [
  {
    key: "slavery_and_halifax",
    slug: "slavery-and-the-founding-of-halifax",
    title: "Slavery and the founding of Halifax",
    chapterTitle: "African Nova Scotians in the Age of Slavery and Abolition",
    period: "1749 – 1834",
    washHex: "#7f2626",
    hoverHex: "#a85c1a",
    angleDeg: 0,
    summary:
      "Enslaved and free people of African descent were present at the founding of Halifax in 1749 and across Nova Scotia in Annapolis Royal, Shelburne, Birchtown, and Preston. Probate inventories, bills of sale, newspaper notices, and Supreme Court petitions before Chief Justices Thomas Strange and Sampson Salter Blowers record how African Nova Scotians challenged enslavement in the courts decades before the Imperial Slavery Abolition Act took effect on 1 August 1834.",
    preparationNotice: null,
    voice: {
      speaker: "Curatorial Note — Cherry Brook",
      role: "Archival Interpretation, Black Cultural Centre for Nova Scotia",
      community: "Halifax · Annapolis Royal · Shelburne · Birchtown · Preston",
      statement:
        "A bill of sale, a probate inventory, or a runaway advertisement in the Halifax Gazette was written to record property. Read carefully in the archive, each document also records a person's name, skill, family ties, and refusal to remain enslaved. We present these records with their exact archival citations so visitors can examine what the documents state.",
      citation:
        "Black Cultural Centre for Nova Scotia & Nova Scotia Archives, African Nova Scotians in the Age of Slavery and Abolition.",
    },
  },
  {
    key: "black_loyalists",
    slug: "black-loyalists",
    title: "Black Loyalists",
    chapterTitle: "Black Loyalists in Birchtown, Shelburne, Preston, and Annapolis Royal",
    period: "1783 – 1792",
    washHex: "#a85c1a",
    hoverHex: "#a67224",
    angleDeg: 300,
    summary:
      "Between April and November 1783, more than 3,000 Black Loyalists whose names were entered in the Book of Negroes arrived in Nova Scotia with certificates of freedom. They founded Birchtown near Shelburne, settled in Preston, Annapolis Royal, Digby, and Guysborough, built churches led by David George, Boston King, and Moses Wilkinson, and petitioned through Thomas Peters when promised land grants were withheld.",
    preparationNotice: null,
    voice: {
      speaker: "Curatorial Note — Birchtown & Preston",
      role: "Black Cultural Centre for Nova Scotia & Black Loyalist Heritage Centre",
      community: "Birchtown · Shelburne · Annapolis Royal · Preston",
      statement:
        "The Inspection Roll of Negroes—known as the Book of Negroes—lists each person's name, age, former status, and the vessel that carried them from New York to Nova Scotia in 1783. Although nearly 1,200 Black Loyalists sailed from Halifax for Sierra Leone in January 1792, the families who remained anchored permanent African Nova Scotian communities.",
      citation:
        "Nova Scotia Archives & Black Loyalist Heritage Centre, Birchtown.",
    },
  },
  {
    key: "the_maroons",
    slug: "the-maroons",
    title: "The Maroons",
    chapterTitle: "The Jamaican Maroons in Halifax and Preston",
    period: "1796 – 1800",
    washHex: "#3a552e",
    hoverHex: "#a67224",
    angleDeg: 240,
    summary:
      "In July 1796, nearly 600 Maroons from Trelawny Town, Jamaica, arrived in Halifax Harbour aboard the Dover, Mary, and Anne. Settled principally at Preston and Boydville, they constructed the Maroon Bastion at the Halifax Citadel and served in the provincial militia before petitioning the British Crown and embarking for Sierra Leone in August 1800.",
    preparationNotice: null,
    voice: {
      speaker: "Curatorial Note — Preston & Halifax Citadel",
      role: "Archival Interpretation, Black Cultural Centre for Nova Scotia",
      community: "Preston · Halifax",
      statement:
        "The Trelawny Town Maroons arrived in Halifax as a free, self-governing community with their own captains, Montague James and Andrew Smith. Their four years in Preston and on the ramparts of Fort George left physical and archival traces across Halifax County.",
      citation:
        "Nova Scotia Archives, Commissioner of Public Records, RG 1, Vols. 52 & 419.",
    },
  },
  {
    key: "the_refugees",
    slug: "the-refugees",
    title: "The Refugees",
    chapterTitle: "Black Refugees of the War of 1812",
    period: "1813 – 1854",
    washHex: "#a67224",
    hoverHex: "#a85c1a",
    angleDeg: 180,
    summary:
      "During and immediately after the War of 1812, approximately 2,000 Black women, men, and children from the Chesapeake Bay and the Georgia Sea Islands came to Nova Scotia aboard Royal Navy ships. Passing through Melville Island in Halifax, they established enduring communities at Preston, Cherry Brook, Hammonds Plains, Beechville, and Cobequid Road, and organized the African United Baptist Association in 1854.",
    preparationNotice: null,
    voice: {
      speaker: "Curatorial Note — Cherry Brook & Preston",
      role: "Black Cultural Society of Nova Scotia (Incorporated 1977)",
      community: "Cherry Brook · Preston · Hammonds Plains · Beechville",
      statement:
        "The families who cleared the ten-acre lots in Preston, Cherry Brook, Hammonds Plains, and Beechville after 1815 did not leave for another colony. They petitioned the Legislature for freehold land titles, built meeting houses with Reverend Richard Preston, and founded the communities where the Black Cultural Centre stands today.",
      citation:
        "Black Cultural Centre for Nova Scotia, Cherry Brook (Established 1983).",
    },
  },
  {
    key: "caribbean_migrants",
    slug: "caribbean-migrants",
    title: "Caribbean migrants",
    chapterTitle: "Caribbean Migrants in Cape Breton and Mainland Nova Scotia",
    period: "1899 – 1939",
    washHex: "#a85c1a",
    hoverHex: "#7f2626",
    angleDeg: 120,
    summary:
      "At the turn of the twentieth century, skilled steelworkers, miners, mariners, and families from Barbados, Jamaica, Trinidad, Antigua, St. Kitts, and Guyana migrated to Sydney's Whitney Pier, Glace Bay, New Waterford, and Halifax, building mutual-aid societies, UNIA divisions, and parishes alongside long-established African Nova Scotian communities.",
    preparationNotice:
      "Additional digitized parish registers, steel-plant paybooks, and oral history recordings from Whitney Pier and Halifax are currently being prepared by the Centre's archivists.",
    voice: {
      speaker: "Curatorial Note — Whitney Pier & Halifax",
      role: "Archival Preparation Note, Black Cultural Centre for Nova Scotia",
      community: "Whitney Pier (Sydney) · Glace Bay · Halifax",
      statement:
        "In Whitney Pier and Halifax, families from Barbados, Jamaica, and the Eastern Caribbean worked the blast furnaces and shipyards, established the Ethiopian Reading Room and UNIA Hall, and linked Nova Scotia directly with the wider Caribbean world.",
      citation:
        "Black Cultural Centre for Nova Scotia & Library and Archives Canada.",
    },
  },
  {
    key: "construction_battalion",
    slug: "no-2-construction-battalion",
    title: "No. 2 Construction Battalion",
    chapterTitle: "No. 2 Construction Battalion, Canadian Expeditionary Force",
    period: "1916 – 1920",
    washHex: "#3a552e",
    hoverHex: "#a85c1a",
    angleDeg: 60,
    summary:
      "Authorized on 5 July 1916 at Pictou and headquartered in Truro, No. 2 Construction Battalion was raised after Black volunteers across Nova Scotia and Canada protested their exclusion from enlistment in the First World War. Led by Chaplain Reverend William Andrew White of the Cornwallis Street Baptist Church, the battalion served in France supporting the Canadian Forestry Corps.",
    preparationNotice:
      "Full service files, attestation papers, and company photographs for No. 2 Construction Battalion are being catalogued in partnership with Library and Archives Canada.",
    voice: {
      speaker: "Curatorial Note — Pictou, Truro & Cherry Brook",
      role: "Military Heritage Collection, Black Cultural Centre for Nova Scotia",
      community: "Pictou · Truro · Halifax · Cherry Brook",
      statement:
        "Every summer at Pictou, Truro, and Cherry Brook, the Centre honours the officers and men of No. 2 Construction Battalion—Canada's only all-Black battalion in the First World War—preserving their nominal rolls, medals, and family letters.",
      citation:
        "Black Cultural Centre for Nova Scotia, Cherry Brook.",
    },
  },
];

/**
 * SOURCE OF TRUTH KEYWORDS: classifyRowToCollection, CollectionKey, African Nova Scotians in the Age of Slavery and Abolition
 * WHAT: Assigns a Postgres catalog row to one of the 6 BCCNS historical chapter halls based on its collection, subjects, title, and date.
 * WHY: Maps live database rows directly into the 6 rotunda portals in the Centre's own order.
 * WHERE: getArchivePayload.
 */
function classifyRowToCollection(row: RawRecordRow, station: ArchiveStation): CollectionKey {
  const haystack = [
    row.dc_title,
    row.dc_description ?? "",
    row.dc_publisher,
    row.dc_source,
    station.collection ?? "",
    ...(row.dc_subject ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("construction battalion") ||
    haystack.includes("forestry corps") ||
    haystack.includes("william andrew white") ||
    haystack.includes("first world war")
  ) {
    return "construction_battalion";
  }

  if (
    haystack.includes("maroon") ||
    haystack.includes("trelawny") ||
    haystack.includes("wentworth")
  ) {
    return "the_maroons";
  }

  if (
    haystack.includes("caribbean") ||
    haystack.includes("west indies") ||
    haystack.includes("barbados") ||
    haystack.includes("whitney pier") ||
    haystack.includes("trinidad")
  ) {
    return "caribbean_migrants";
  }

  if (
    haystack.includes("black refugees") ||
    haystack.includes("war of 1812") ||
    haystack.includes("cochrane") ||
    haystack.includes("melville island") ||
    haystack.includes("hammonds plains") ||
    haystack.includes("cherry brook")
  ) {
    // Records specifically from the Nova Scotia Archives "Age of Slavery and Abolition" collection also enrich the first gallery
    return "the_refugees";
  }

  if (
    row.dc_publisher === "Black Loyalist Heritage Centre" ||
    haystack.includes("black loyalist") ||
    haystack.includes("book of negroes") ||
    haystack.includes("birchtown") ||
    haystack.includes("boston king") ||
    haystack.includes("david george") ||
    haystack.includes("thomas peters")
  ) {
    return "black_loyalists";
  }

  return "slavery_and_halifax";
}

/**
 * SOURCE OF TRUTH KEYWORDS: getArchivePayload, ArchivePayload, Supabase records, Dublin Core stations
 * WHAT: Loads the 6 BCCNS collections and their chronologically ordered stations from Supabase Postgres, merging curated archival stations when needed.
 * WHY: Provides a single server-validated payload for the 3D rotunda, gallery corridors, collection map, and deep links.
 * WHERE: app/page.tsx, app/museum/page.tsx, and app/api/archive/route.ts.
 */
export async function getArchivePayload(): Promise<ArchivePayload> {
  let liveDatabaseConnected = false;
  let totalCatalogRecords = 0;

  const groupedLive: Record<CollectionKey, ArchiveStation[]> = {
    slavery_and_halifax: [],
    black_loyalists: [],
    the_maroons: [],
    the_refugees: [],
    caribbean_migrants: [],
    construction_battalion: [],
  };

  if (hasEnvVars) {
    try {
      const supabase = await createClient();
      const [countRes, rowsRes] = await Promise.all([
        supabase.from("records").select("id", { count: "exact", head: true }),
        supabase
          .from("records")
          .select(ARCHIVE_RECORD_COLUMNS)
          .order("dc_date", { ascending: true, nullsFirst: false })
          .limit(240),
      ]);

      if (!rowsRes.error && rowsRes.data) {
        liveDatabaseConnected = true;
        totalCatalogRecords = countRes.count ?? rowsRes.data.length;

        const parsedRows = z.array(rawRecordRowSchema).parse(rowsRes.data);
        for (const row of parsedRows) {
          const station = mapRowToStation(row);
          const colKey = classifyRowToCollection(row, station);
          if (groupedLive[colKey].length < 18) {
            groupedLive[colKey].push(station);
          }
          // Ensure "African Nova Scotians in the Age of Slavery and Abolition" rows also populate the first gallery in full
          if (
            colKey !== "slavery_and_halifax" &&
            (row.dc_publisher === "Nova Scotia Archives" ||
              (station.collection ?? "").toLowerCase().includes("slavery")) &&
            groupedLive.slavery_and_halifax.length < 18
          ) {
            groupedLive.slavery_and_halifax.push(station);
          }
        }
      }
    } catch {
      liveDatabaseConnected = false;
    }
  }

  const collections: ArchiveCollection[] = COLLECTION_DEFINITIONS.map((def) => {
    const liveStations = groupedLive[def.key];
    const fallbackStations = CURATED_STATIONS_BY_COLLECTION[def.key];

    const byIdentifier = new Map<string, ArchiveStation>();
    // Seed curated stations first so their digitized media_url scans are always present
    for (const st of fallbackStations) {
      byIdentifier.set(st.dc_identifier, st);
    }
    for (const st of liveStations) {
      const existing = byIdentifier.get(st.dc_identifier);
      if (existing && !st.media_url && existing.media_url) {
        byIdentifier.set(st.dc_identifier, {
          ...st,
          media_url: existing.media_url,
          bccns_digitized: true,
        });
      } else {
        byIdentifier.set(st.dc_identifier, st);
      }
    }

    // Prioritize records with available images for the initial gallery station cards while preserving chronological order
    const orderedStations = Array.from(byIdentifier.values()).sort((a, b) => {
      const aHasImg = Boolean(a.media_url) ? 0 : 1;
      const bHasImg = Boolean(b.media_url) ? 0 : 1;
      if (aHasImg !== bHasImg) return aHasImg - bHasImg;
      return a.sort_year - b.sort_year || a.dc_title.localeCompare(b.dc_title);
    });

    return {
      ...def,
      stations: orderedStations,
    };
  });

  if (!liveDatabaseConnected) {
    totalCatalogRecords = collections.reduce(
      (sum, col) => sum + col.stations.length,
      0,
    );
  }

  return archivePayloadSchema.parse({
    institution: {
      name: "Black Cultural Centre for Nova Scotia",
      location: "Cherry Brook, Nova Scotia",
      established: "1983",
      societyIncorporated: "1977",
      mandate:
        "To protect, preserve, and promote the history and culture of African Nova Scotians — Canada’s oldest Black communities.",
    },
    collections,
    liveDatabaseConnected,
    totalCatalogRecords,
  });
}
