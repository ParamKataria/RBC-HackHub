import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  chooseChapter,
  HALL_STATION_LIMIT,
  type ChapterPlacement,
} from "@/src/lib/archive/chapters";
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
 * WHY: Gallery stations are catalog rows loaded from Supabase. Record text is the scraped Dublin Core, not a second handwritten copy.
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
 * SOURCE OF TRUTH KEYWORDS: placeCatalogRow, chooseChapter, ArchiveStation, historical year
 * WHAT: Turns one catalog row into a scored station, or skips it when no chapter fits.
 * WHY: The gallery walk only shows records whose own words and event year agree with that room.
 * WHERE: getArchivePayload.
 */
function placeCatalogRow(
  row: RawRecordRow,
): { station: ArchiveStation; placement: ChapterPlacement } | null {
  const placement = chooseChapter({
    title: row.dc_title,
    description: row.dc_description,
    source: row.dc_source,
    publisher: row.dc_publisher,
    date: row.dc_date,
    dateText: row.date_text,
    temporal: row.dcterms_temporal,
  });
  if (!placement) return null;

  const station = mapRowToStation(row);
  // An event year written on the record wins. Otherwise keep the page or document date
  // already read by mapRowToStation, including a 2022 ceremony date.
  if (placement.year) {
    station.sort_year = placement.year.year;
    station.display_year = placement.year.label;
  }
  return { station, placement };
}

/**
 * SOURCE OF TRUTH KEYWORDS: loadCatalogRows, records, range, ArchivePayload
 * WHAT: Reads every catalog row, one page at a time.
 * WHY: The halls used to see only Nova Scotia Archives plus the 240 earliest dates, so Loyalist pages never arrived.
 * WHERE: getArchivePayload.
 */
async function loadCatalogRows(): Promise<RawRecordRow[] | null> {
  const supabase = await createClient();
  const rows: RawRecordRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("records")
      .select(ARCHIVE_RECORD_COLUMNS)
      .range(offset, offset + pageSize - 1);
    if (error || !data) {
      return rows.length > 0 ? rows : null;
    }
    for (const row of data) {
      const parsed = rawRecordRowSchema.safeParse(row);
      if (parsed.success) rows.push(parsed.data);
    }
    if (data.length < pageSize) return rows;
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: getArchivePayload, ArchivePayload, chooseChapter, HALL_STATION_LIMIT
 * WHAT: Loads the 6 BCCNS halls from the records that match each chapter.
 * WHY: Each wall keeps the strongest matches, then shows those matches in historical year order.
 * WHERE: app/page.tsx, app/museum/page.tsx, and app/api/archive/route.ts.
 */
export async function getArchivePayload(): Promise<ArchivePayload> {
  let liveDatabaseConnected = false;
  let totalCatalogRecords = 0;

  const groupedLive: Record<
    CollectionKey,
    { station: ArchiveStation; score: number }[]
  > = {
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
      const [countRes, rows] = await Promise.all([
        supabase.from("records").select("id", { count: "exact", head: true }),
        loadCatalogRows(),
      ]);

      if (rows) {
        liveDatabaseConnected = true;
        totalCatalogRecords = countRes.count ?? rows.length;
        for (const row of rows) {
          const placed = placeCatalogRow(row);
          if (!placed) continue;
          groupedLive[placed.placement.key].push({
            station: placed.station,
            score: placed.placement.score,
          });
        }
      }
    } catch {
      liveDatabaseConnected = false;
    }
  }

  const collections: ArchiveCollection[] = COLLECTION_DEFINITIONS.map((def) => {
    const orderedStations = groupedLive[def.key]
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.station.sort_year - b.station.sort_year ||
          a.station.dc_title.localeCompare(b.station.dc_title),
      )
      .slice(0, HALL_STATION_LIMIT)
      .map((entry) => entry.station)
      .sort(
        (a, b) => a.sort_year - b.sort_year || a.dc_title.localeCompare(b.dc_title),
      );

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
        "To protect, preserve, and promote the history and culture of African Nova Scotians, Canada\u2019s oldest Black communities.",
    },
    collections,
    liveDatabaseConnected,
    totalCatalogRecords,
  });
}
