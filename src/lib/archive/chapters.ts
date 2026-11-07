import type { CollectionKey } from "@/src/types/museum";

/**
 * SOURCE OF TRUTH KEYWORDS: chooseChapter, historicalYear, chapterYearSpan, publicationDatePublisher, hall chapter
 * WHAT: Assigns a catalog record to one of the six chapter halls from its own words and historical year.
 * WHY: Exhibit-wide subject tags were placing 1750s records on the Refugees wall and Viola Desmond in the founding-of-Halifax room.
 * WHERE: lib/services/archive.ts when it builds the rotunda galleries, and tests/chapter-placement.test.ts.
 */

export const HALL_STATION_LIMIT = 36;

/** Years allowed outside a chapter's labeled span. */
export const CHAPTER_YEAR_SLACK = 14;

export const publicationDatePublishers = [
  "The Canadian Encyclopedia",
  "A Black People's History of Canada",
] as const;

export const chapterYearSpan: Record<
  CollectionKey,
  { start: number; end: number }
> = {
  slavery_and_halifax: { start: 1749, end: 1834 },
  black_loyalists: { start: 1783, end: 1792 },
  the_maroons: { start: 1796, end: 1800 },
  the_refugees: { start: 1813, end: 1854 },
  caribbean_migrants: { start: 1899, end: 1939 },
  construction_battalion: { start: 1916, end: 1920 },
};

const TITLE_SPECIFIC_SCORE = 6;
const BODY_SPECIFIC_SCORE = 3;
const TITLE_BROAD_SCORE = 2;
const PUBLISHER_SCORE = 4;

const novaScotiaPlaces = [
  "nova scotia",
  "halifax",
  "shelburne",
  "birchtown",
  "preston",
  "liverpool",
  "windsor",
  "falmouth",
  "parrsboro",
  "sydney",
] as const;

const YEAR_PATTERN = /\b(1[6-9]\d{2}|20[0-2]\d)\b/g;

type ChapterRule = {
  key: CollectionKey;
  specific: readonly string[];
  /** Title-only names. A web page can carry this title even when the article mentions other years. */
  titleMarks: readonly string[];
  broad: readonly string[];
};

const chapterRules: readonly ChapterRule[] = [
  {
    key: "construction_battalion",
    specific: [
      "construction battalion",
      "no. 2 construction",
      "forestry corps",
      "william andrew white",
    ],
    titleMarks: ["construction battalion", "no. 2 construction"],
    broad: ["first world war"],
  },
  {
    key: "the_maroons",
    specific: ["maroon", "trelawny"],
    titleMarks: [],
    broad: [],
  },
  {
    key: "caribbean_migrants",
    specific: ["whitney pier", "caribbean migrant"],
    titleMarks: ["caribbean"],
    broad: ["west indies", "barbados", "trinidad"],
  },
  {
    key: "the_refugees",
    specific: [
      "black refugee",
      "war of 1812",
      "melville island",
      "hammonds plains",
    ],
    titleMarks: [],
    broad: ["cherry brook"],
  },
  {
    key: "black_loyalists",
    specific: [
      "black loyalist",
      "book of negroes",
      "birchtown",
      "boston king",
      "david george",
      "thomas peters",
    ],
    titleMarks: [],
    broad: [],
  },
  {
    key: "slavery_and_halifax",
    specific: ["slavery", "enslaved", "slave"],
    titleMarks: [],
    broad: [],
  },
];

export type ChapterRecordText = {
  title: string;
  description: string | null;
  source: string;
  publisher: string;
  date: string | null;
  dateText: string | null;
  temporal: string | null;
};

export type HistoricalYear = {
  year: number;
  label: string;
};

export type ChapterPlacement = {
  key: CollectionKey;
  score: number;
  year: HistoricalYear | null;
};

/**
 * SOURCE OF TRUTH KEYWORDS: publicationDatePublisher, Canadian Encyclopedia, Black People's History of Canada
 * WHAT: Reports whether dc_date on this publisher is the date of the web page.
 * WHY: Those dates sit in the 2000s and were sorting encyclopedia articles as if the event happened then.
 * WHERE: historicalYear and the hall station year label.
 */
export function isPublicationDatePublisher(publisher: string): boolean {
  return publicationDatePublishers.some((name) => name === publisher);
}

/**
 * SOURCE OF TRUTH KEYWORDS: yearFitsChapter, CHAPTER_YEAR_SLACK, chapterYearSpan
 * WHAT: Checks a historical year against one chapter, including the shared slack.
 * WHY: A petition a few years outside the labeled span can still belong to that chapter.
 * WHERE: chooseChapter.
 */
export function yearFitsChapter(year: number, key: CollectionKey): boolean {
  const span = chapterYearSpan[key];
  return (
    year >= span.start - CHAPTER_YEAR_SLACK &&
    year <= span.end + CHAPTER_YEAR_SLACK
  );
}

function yearsIn(value: string): number[] {
  return [...value.matchAll(YEAR_PATTERN)].map((match) =>
    Number.parseInt(match[1] ?? "", 10),
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: historicalYear, ChapterRecordText, publication date, date_text
 * WHAT: Reads the earliest event year written on the record, skipping web-page dates.
 * WHY: Chapter gates and the gallery walk need the year of the document, not the year an article was posted.
 * WHERE: chooseChapter and lib/services/archive.ts station labels.
 */
export function historicalYear(record: ChapterRecordText): HistoricalYear | null {
  const pagePublisher = isPublicationDatePublisher(record.publisher);
  const fields = pagePublisher
    ? [record.dateText, record.temporal, record.title, record.description, record.source]
    : [
        record.date,
        record.dateText,
        record.temporal,
        record.title,
        record.source,
        record.description,
      ];

  for (const field of fields) {
    if (!field) continue;
    for (const year of yearsIn(field)) {
      if (pagePublisher && year >= 1990) continue;
      const trimmed = field.trim();
      return {
        year,
        label: trimmed.length <= 28 ? trimmed : String(year),
      };
    }
  }
  return null;
}

function includesPhrase(haystack: string, phrase: string): boolean {
  return haystack.toLowerCase().includes(phrase);
}

function phraseScore(
  title: string,
  body: string,
  phrases: readonly string[],
  titleScore: number,
  bodyScore: number,
): number {
  let score = 0;
  for (const phrase of phrases) {
    if (includesPhrase(title, phrase)) score += titleScore;
    else if (includesPhrase(body, phrase)) score += bodyScore;
  }
  return score;
}

/**
 * SOURCE OF TRUTH KEYWORDS: chooseChapter, ChapterPlacement, CollectionKey, keyword score
 * WHAT: Picks at most one chapter for a record, or none when the words and year do not agree.
 * WHY: Subject bundles shared by a whole exhibit are not evidence, and a record with no fit stays in the catalog.
 * WHERE: getArchivePayload, before a station is added to a gallery.
 */
function mentionsNovaScotia(
  title: string,
  body: string,
  publisher: string,
): boolean {
  if (publisher === "Nova Scotia Archives") return true;
  const blob = `${title} ${body}`;
  return novaScotiaPlaces.some((place) => blob.includes(place));
}

export function chooseChapter(record: ChapterRecordText): ChapterPlacement | null {
  const found = historicalYear(record);
  const title = record.title.toLowerCase();
  const body = `${record.description ?? ""} ${record.source}`.toLowerCase();
  const pagePublisher = isPublicationDatePublisher(record.publisher);
  let best: ChapterPlacement | null = null;

  for (const rule of chapterRules) {
    const titled =
      rule.specific.some((phrase) => title.includes(phrase)) ||
      rule.titleMarks.some((phrase) => title.includes(phrase));
    // A web page titled for the chapter can name other years in the article.
    const yearOk =
      found === null ||
      yearFitsChapter(found.year, rule.key) ||
      (titled && pagePublisher);
    if (!yearOk) continue;
    if (
      rule.key === "slavery_and_halifax" &&
      !mentionsNovaScotia(title, body, record.publisher)
    ) {
      continue;
    }

    let score =
      phraseScore(
        title,
        body,
        rule.specific,
        TITLE_SPECIFIC_SCORE,
        BODY_SPECIFIC_SCORE,
      ) + phraseScore(title, "", rule.titleMarks, TITLE_SPECIFIC_SCORE, 0);
    // A broad word in the body of a national overview is not enough to enter a chapter.
    if (found !== null) {
      score += phraseScore(title, "", rule.broad, TITLE_BROAD_SCORE, 0);
    }
    if (
      rule.key === "black_loyalists" &&
      record.publisher === "Black Loyalist Heritage Centre"
    ) {
      score += PUBLISHER_SCORE;
    }
    if (score === 0) continue;
    if (best === null || score > best.score) {
      best = { key: rule.key, score, year: found };
    }
  }

  return best;
}
