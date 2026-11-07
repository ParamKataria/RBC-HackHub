import "server-only";

/**
 * SOURCE OF TRUTH KEYWORDS: askService, askArchive, claimLines, filtersFromQuestion, hasSearchFilter, AskResponse
 * WHAT: Server-only archive question-answering service with vocabulary filter translation and strict citation grounding.
 * WHY: Ensures Gemini answers only from retrieved catalog records and strips uncited or fabricated UUID claims on the server.
 * WHERE: app/api/ask/route.ts and unit verification tests in tests/ask-search-verification.test.ts.
 */

import { createClient } from "@/lib/supabase/server";
import {
  askResponseSchema,
  geminiResponseSchema,
  modelClaimsSchema,
  nameRowsSchema,
  noArchiveSourceMessage,
  noDirectAnswerMessage,
  recordTypeValues,
  searchQuerySchema,
  type AskCitation,
  type AskClaim,
  type AskModelClaim,
  type AskResponse,
  type AskView,
  type AskVocabulary,
  type AskVocabularyCache,
  type CatalogRecord,
  type ExtraIdValue,
  type LanguageModelInput,
  type LanguageModelPort,
  type ModelClaims,
  type RecordBrief,
  type RecordsInViewResult,
  type ScoredEvidenceRecord,
  type SearchQuery,
} from "@/src/types";
import { z } from "zod";

import { getArchivePayload } from "./archive";
import {
  InMemoryModelAdapter,
  createInMemoryModelAdapter,
} from "./model-adapter";
import { recordsByIds, searchRecords } from "./search";

export { InMemoryModelAdapter, createInMemoryModelAdapter };

const EVIDENCE_LIMIT = 16;
const EVIDENCE_POOL = 40;
const VOCABULARY_TTL_MS = 5 * 60 * 1000;

const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
];

const RECORD_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const BRACKETED_RECORD_ID_PATTERN =
  /\[\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*\]/gi;

const claimsJsonSchema = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          recordIds: { type: "array", items: { type: "string" } },
        },
        required: ["text", "recordIds"],
      },
    },
  },
  required: ["claims"],
};

/**
 * SOURCE OF TRUTH KEYWORDS: geminiModels, GEMINI_MODEL, gemini-3.1-flash-lite, fallbackModels, askArchive
 * WHAT: Model order for the server-side Gemini calls.
 * WHY: GEMINI_MODEL overrides the default, and the next models cover a 404 or a temporary overload.
 * WHERE: generateClaimsJson in lib/services/ask.ts.
 */
function geminiModels(): string[] {
  const chosen = process.env.GEMINI_MODEL?.trim();
  if (!chosen) {
    return MODELS;
  }
  return [chosen, ...MODELS.filter((model) => model !== chosen)];
}

/**
 * SOURCE OF TRUTH KEYWORDS: stripJsonFence, GeminiJSON, markdownFence, generateClaimsJson, askArchive
 * WHAT: Removes a markdown fence around a JSON payload.
 * WHY: Structured output is usually raw JSON, and a fenced reply still has to parse.
 * WHERE: generateClaimsJson in lib/services/ask.ts.
 */
function stripJsonFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

/**
 * SOURCE OF TRUTH KEYWORDS: generateClaimsJson, GEMINI_API_KEY, claimsJsonSchema, ModelClaims, /api/ask
 * WHAT: Calls Gemini and returns the validated ModelClaims object it was told to produce.
 * WHY: The summary stays on the server, and the API key never reaches the browser.
 * WHERE: askArchive in lib/services/ask.ts.
 */
async function generateClaimsJson(
  prompt: string,
  maxOutputTokens?: number,
): Promise<ModelClaims> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  let lastMessage = "Gemini request failed";
  for (const model of geminiModels()) {
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseJsonSchema: claimsJsonSchema,
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
            },
          }),
        },
      );
    } catch {
      lastMessage = "Gemini request timed out";
      continue;
    }
    const parsed = geminiResponseSchema.safeParse(await response.json());
    if (!response.ok) {
      lastMessage = parsed.success
        ? (parsed.data.error?.message ?? lastMessage)
        : lastMessage;
      if (
        response.status === 404 ||
        response.status === 429 ||
        response.status === 503
      ) {
        continue;
      }
      throw new Error(lastMessage);
    }
    const text = parsed.success
      ? (parsed.data.candidates?.[0]?.content?.parts
          ?.filter((part) => !part.thought && part.text)
          .map((part) => part.text)
          .join("") ?? "")
      : "";
    if (!text) {
      lastMessage = "Gemini returned an empty response";
      continue;
    }
    try {
      return modelClaimsSchema.parse(JSON.parse(stripJsonFence(text)));
    } catch {
      lastMessage = "Gemini returned an unreadable response";
      continue;
    }
  }
  throw new Error(lastMessage);
}

/**
 * SOURCE OF TRUTH KEYWORDS: GeminiModelAdapter, LanguageModelPort, defaultModelAdapter, generateClaimsJson, askArchive
 * WHAT: Default language model adapter calling Google Gemini through generateClaimsJson.
 * WHY: Provides production execution of the LanguageModelPort interface for live inquiry processing.
 * WHERE: askArchive in lib/services/ask.ts and app/api/ask/route.ts.
 */
export class GeminiModelAdapter implements LanguageModelPort {
  async generateClaims(
    input: LanguageModelInput | string,
    options?: { maxOutputTokens?: number },
  ): Promise<ModelClaims> {
    const prompt = typeof input === "string" ? input : input.prompt;
    const maxOutputTokens =
      typeof input === "object" && input.maxOutputTokens !== undefined
        ? input.maxOutputTokens
        : options?.maxOutputTokens;
    return generateClaimsJson(prompt, maxOutputTokens);
  }
}

export const defaultModelAdapter: LanguageModelPort = new GeminiModelAdapter();

let vocabularyCache: AskVocabularyCache | null = null;

/**
 * SOURCE OF TRUTH KEYWORDS: askVocabulary, AskVocabulary, sources, subjects, places, people
 * WHAT: Loads the publisher, subject, place, and people names the translator is allowed to emit.
 * WHY: Institution, subject, place, and creator filters match known catalog entity names.
 * WHERE: askArchive, before the filter translation.
 */
async function askVocabulary(): Promise<AskVocabulary> {
  const now = Date.now();
  if (vocabularyCache && vocabularyCache.expires > now) {
    return vocabularyCache;
  }
  const supabase = await createClient();
  const [sourcesResult, subjectsResult, placesResult, peopleResult] =
    await Promise.all([
      supabase.from("sources").select("name").order("name"),
      supabase.from("subjects").select("name").order("name"),
      supabase.from("places").select("name").order("name"),
      supabase.from("people").select("name").order("name"),
    ]);
  if (sourcesResult.error) {
    throw new Error(sourcesResult.error.message);
  }
  if (subjectsResult.error) {
    throw new Error(subjectsResult.error.message);
  }
  if (placesResult.error) {
    throw new Error(placesResult.error.message);
  }
  if (peopleResult.error) {
    throw new Error(peopleResult.error.message);
  }
  const names: AskVocabulary = {
    publishers: nameRowsSchema
      .parse(sourcesResult.data)
      .map((row) => row.name),
    subjects: nameRowsSchema.parse(subjectsResult.data).map((row) => row.name),
    places: nameRowsSchema.parse(placesResult.data).map((row) => row.name),
    people: nameRowsSchema.parse(peopleResult.data).map((row) => row.name),
  };
  vocabularyCache = { expires: now + VOCABULARY_TTL_MS, ...names };
  return names;
}

/**
 * SOURCE OF TRUTH KEYWORDS: hasSearchFilter, SearchQuery, creator, institution, emptyQuestion
 * WHAT: Reports whether a translated query narrows the catalog.
 * WHY: An empty filter set would list every record and is not a grounded match.
 * WHERE: askArchive, before searchRecords.
 */
export function hasSearchFilter(filters: SearchQuery): boolean {
  return Boolean(
    filters.q ||
      filters.institution ||
      filters.type ||
      filters.creator ||
      filters.subject ||
      filters.place ||
      filters.from ||
      filters.to,
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordBrief, RecordBrief, CatalogRecord, evidence, summaryPrompt
 * WHAT: Copies the stored fields the summary model is allowed to read.
 * WHY: The model must not see raw metadata or fields that were not retrieved for this question.
 * WHERE: The summary prompt inside askArchive.
 */
function recordBrief(record: CatalogRecord): RecordBrief {
  return {
    id: record.id,
    title: record.dc_title,
    type: record.dc_type,
    publisher: record.dc_publisher,
    creator: record.dc_creator,
    date: record.dc_date,
    dateText: record.date_text,
    place: record.dcterms_spatial,
    timePeriod: record.dcterms_temporal,
    subjects: record.dc_subject,
    description: record.dc_description?.slice(0, 280) ?? null,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: evidenceCitations, AskCitation, recordId, Sources, dc_title
 * WHAT: Builds one citation per retrieved record, using the stored title.
 * WHY: Citation titles come from the catalog, not from the model.
 * WHERE: The ask response citations array.
 */
function evidenceCitations(records: readonly CatalogRecord[]): AskCitation[] {
  return records.map((record) => ({ id: record.id, title: record.dc_title }));
}


/**
 * SOURCE OF TRUTH KEYWORDS: sourceBlock, recordId, Sources, citation, dc_title
 * WHAT: Lists every retrieved record as a title plus its record id.
 * WHY: The answer text cites each record id that was given to the model.
 * WHERE: The summary Sources section.
 */
function sourceBlock(records: readonly CatalogRecord[]): string {
  return records
    .map((record) => `${record.dc_title} [${record.id}]`)
    .join("\n");
}

/**
 * SOURCE OF TRUTH KEYWORDS: countLead, evidenceLimit, matchingRecords, summaryHeader, count
 * WHAT: States how many records matched and how many are cited.
 * WHY: The summary covers the retrieved page, and the count says when more matches exist.
 * WHERE: The start of a grounded summary.
 */
function countLead(count: number, cited: number): string {
  if (count > cited) {
    return `The search matched ${count} records. This answer cites ${cited} of them.`;
  }
  return `The search matched ${count} records.`;
}

/**
 * SOURCE OF TRUTH KEYWORDS: groundClaims, AskClaim, citationGrounding, pruneHallucinations, GroundedClaim
 * WHAT: Validates drafted model claims against retrieved candidate records and extra IDs, pruning fabricated IDs and ungrounded claims.
 * WHY: Ensures that only factual claims strictly grounded in retrieved catalog records are emitted, with no unverified UUIDs.
 * WHERE: askArchive in lib/services/ask.ts, claimLines backward compatibility, and automated tests.
 */
export function groundClaims(
  claims: readonly AskModelClaim[],
  records: readonly CatalogRecord[],
  extraIds: ReadonlyMap<string, ExtraIdValue> = new Map(),
): AskClaim[] {
  const idsByLower = new Map(
    records.map((record) => [record.id.toLowerCase(), record.id]),
  );
  for (const id of extraIds.keys()) {
    idsByLower.set(id.toLowerCase(), id);
  }

  const grounded: AskClaim[] = [];
  for (const claim of claims) {
    const requested = [
      ...new Set(
        claim.recordIds
          .map((id) => id.trim().toLowerCase())
          .filter((id) => id.length > 0),
      ),
    ];
    const mentioned = (claim.text.match(RECORD_ID_PATTERN) ?? []).map((id) =>
      id.toLowerCase(),
    );

    const candidateLowerIds =
      requested.length > 0 ? requested : [...new Set(mentioned)];

    // Prune unverified or fabricated IDs, retaining only verified candidate IDs
    const validCitedRecordIds = candidateLowerIds
      .filter((id) => idsByLower.has(id))
      .map((id) => idsByLower.get(id)!);

    // If claim cites zero valid records, prune it
    if (validCitedRecordIds.length === 0) {
      continue;
    }

    const text = claim.text
      .replace(BRACKETED_RECORD_ID_PATTERN, " ")
      .replace(RECORD_ID_PATTERN, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      continue;
    }

    grounded.push({
      text,
      citedRecordIds: [...new Set(validCitedRecordIds)],
    });
  }

  return grounded;
}

/**
 * SOURCE OF TRUTH KEYWORDS: claimLines, AskModelClaim, recordIds, citationGrounding, ExtraIdValue
 * WHAT: Validates and formats drafted model claims so every kept sentence cites at least one retrieved record id and zero unknown ids.
 * WHY: Backward compatibility helper formatting grounded claims into bracketed record ID lines.
 * WHERE: askArchive in lib/services/ask.ts and unit verification tests.
 */
export function claimLines(
  claims: readonly AskModelClaim[],
  records: readonly CatalogRecord[],
  extraIds: ReadonlyMap<string, ExtraIdValue> = new Map(),
): string[] {
  const grounded = groundClaims(claims, records, extraIds);
  return grounded.map(
    (claim) =>
      `${claim.text} ${claim.citedRecordIds.map((id) => `[${id}]`).join(" ")}`,
  );
}

const QUESTION_STOP_WORDS = new Set([
  "when",
  "was",
  "were",
  "the",
  "and",
  "for",
  "what",
  "who",
  "where",
  "did",
  "does",
  "how",
  "which",
  "year",
  "first",
  "about",
  "from",
  "with",
  "that",
  "this",
]);

/**
 * SOURCE OF TRUTH KEYWORDS: questionTokens, QUESTION_STOP_WORDS, SearchQuery, selectEvidence, tokenFilter
 * WHAT: Keeps the content words from a question.
 * WHY: Retrieval and ranking use the words the person asked, with no topic list of our own.
 * WHERE: filtersFromQuestion, searchTerms, and selectEvidence.
 */
function questionTokens(question: string): string[] {
  return (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 2 && !QUESTION_STOP_WORDS.has(token),
  );
}

const KEYWORD_STOP_WORDS = new Set([
  ...QUESTION_STOP_WORDS,
  "records",
  "record",
  "mention",
  "mentions",
  "mentioned",
  "history",
  "black",
  "people",
  "community",
  "communities",
  "archive",
  "document",
  "documents",
]);

/**
 * SOURCE OF TRUTH KEYWORDS: longestCatalogName, phraseInQuestion, place, subject, creator, institution
 * WHAT: Finds the longest catalog name written in the question.
 * WHY: A place, subject, creator, or institution filter is set only when that exact name is already in the catalog.
 * WHERE: filtersFromQuestion in lib/services/ask.ts.
 */
function longestCatalogName(
  question: string,
  names: readonly string[],
  minLength: number,
): string | undefined {
  const matches = names.filter((name) => {
    const phrase = name.trim();
    if (phrase.length < minLength) {
      return false;
    }
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(
      question,
    );
  });
  matches.sort((left, right) => right.length - left.length);
  return matches[0];
}

/**
 * SOURCE OF TRUTH KEYWORDS: properNameTokens, capitalizedNames, question, keywords, searchTerms
 * WHAT: Reads the capitalized names written in a question.
 * WHY: Filter keywords and the global search must use the same names.
 * WHERE: filtersFromQuestion and searchTerms in lib/services/ask.ts.
 */
function properNameTokens(question: string): string[] {
  return (
    question.match(
      /\b[A-Z][A-Za-z'’.-]{2,}(?:\s+[A-Z][A-Za-z'’.-]{2,})*/g,
    ) ?? []
  ).flatMap((phrase) => phrase.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/**
 * SOURCE OF TRUTH KEYWORDS: filtersFromQuestion, SearchQuery, AskVocabulary, creator, place, subject
 * WHAT: Turns a question into search filters from catalog names and the names written in the question.
 * WHY: The record search can start immediately, and the model is used only to write the cited answer.
 * WHERE: askArchive, before the searches.
 */
export function filtersFromQuestion(
  question: string,
  names: AskVocabulary,
): SearchQuery {
  const place = longestCatalogName(question, names.places, 4);
  const subject = longestCatalogName(
    question,
    names.subjects.filter(
      (name) =>
        name.toLowerCase() !== place?.toLowerCase() &&
        (name.trim().includes(" ") || name.trim().length >= 12),
    ),
    8,
  );
  const institution = longestCatalogName(question, names.publishers, 8);
  const creator = longestCatalogName(
    question,
    (names.people ?? []).filter(
      (name) =>
        name.toLowerCase() !== place?.toLowerCase() &&
        name.toLowerCase() !== subject?.toLowerCase() &&
        name.toLowerCase() !== institution?.toLowerCase(),
    ),
    5,
  );
  const type = recordTypeValues.find((recordType) =>
    new RegExp(`(?:^|[^a-z])${recordType}(?=$|[^a-z])`, "i").test(question),
  );
  const used = new Set(
    [place, subject, institution, creator]
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [],
  );
  const properNames = properNameTokens(question);
  const keywords = [
    ...new Set(
      properNames.length > 0 ? properNames : questionTokens(question),
    ),
  ].filter(
    (token) =>
      token.length > 3 &&
      !used.has(token) &&
      !KEYWORD_STOP_WORDS.has(token) &&
      !/^\d/.test(token),
  );
  const identified = Boolean(place || subject || institution || creator || type);
  const q =
    !identified || keywords.length > 0
      ? keywords.slice(0, 6).join(" ")
      : undefined;
  return searchQuerySchema.parse({
    q: q || undefined,
    institution,
    type,
    creator,
    subject,
    place,
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: searchTerms, properNames, KEYWORD_STOP_WORDS, globalQuestionSearch, companionQueries
 * WHAT: Keeps the distinctive names in a question, at most four.
 * WHY: Searching common words such as "records" matches most of the catalog and slows the query.
 * WHERE: companionQueries and globalQuestionSearch.
 */
function searchTerms(question: string): string[] {
  const properNames = properNameTokens(question);
  const source = properNames.length > 0 ? properNames : questionTokens(question);
  return [...new Set(source)]
    .filter(
      (token) =>
        token.length > 3 &&
        !KEYWORD_STOP_WORDS.has(token) &&
        !/^\d/.test(token),
    )
    .slice(0, 4);
}

/**
 * SOURCE OF TRUTH KEYWORDS: companionQueries, place, subject, creator, EVIDENCE_POOL, SearchQuery
 * WHAT: Adds companion queries for cross-field entity matches and keyword-relaxed fallback.
 * WHY: A subject, place, or creator might also appear in another field, and the summary can only use records it was given.
 * WHERE: askArchive, beside the strict search.
 */
function companionQueries(
  question: string,
  filters: SearchQuery,
): SearchQuery[] {
  const companions: SearchQuery[] = [];
  if (filters.place && filters.subject) {
    companions.push(searchQuerySchema.parse({ place: filters.place }));
    companions.push(searchQuerySchema.parse({ subject: filters.subject }));
  } else if (filters.subject) {
    companions.push(searchQuerySchema.parse({ place: filters.subject }));
  } else if (filters.place) {
    companions.push(searchQuerySchema.parse({ subject: filters.place }));
  }
  const words = searchTerms(question).filter(
    (token) =>
      token !== filters.place?.toLowerCase() &&
      token !== filters.subject?.toLowerCase(),
  );
  if (words.length > 0 && filters.place) {
    companions.push(
      searchQuerySchema.parse({ q: words.join(" OR "), place: filters.place }),
    );
  } else if (words.length > 0 && filters.subject) {
    companions.push(
      searchQuerySchema.parse({
        q: words.join(" OR "),
        subject: filters.subject,
      }),
    );
  }
  if (
    filters.q &&
    (filters.place ||
      filters.subject ||
      filters.institution ||
      filters.creator ||
      filters.type)
  ) {
    companions.push(searchQuerySchema.parse({ ...filters, q: undefined }));
  }
  return companions;
}

/**
 * SOURCE OF TRUTH KEYWORDS: globalQuestionSearch, allSources, searchTerms, EVIDENCE_POOL, CatalogRecord
 * WHAT: Searches the question across every source, with no place, institution, or room limit.
 * WHY: The catalog ask is a search of the whole archive, so a citation can come from any matching record.
 * WHERE: askArchive when the viewer is not standing in a room or in front of a record.
 */
async function globalQuestionSearch(question: string): Promise<CatalogRecord[]> {
  const words = searchTerms(question);
  if (words.length === 0) {
    return [];
  }
  const extra = await searchRecords(
    searchQuerySchema.parse({ q: words.join(" OR ") }),
    {
      limit: EVIDENCE_POOL,
    },
  );
  return extra.results;
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordsInView, AskView, RecordsInViewResult, getArchivePayload, recordsByIds
 * WHAT: Resolves the gallery, and the picture in front of the viewer, from the archive payload.
 * WHY: The browser only sends a collection key and record id. The text the model reads is loaded on the server.
 * WHERE: askArchive, before the summary prompt.
 */
async function recordsInView(
  view: AskView | undefined,
): Promise<RecordsInViewResult> {
  if (!view) {
    return { note: "", records: [], wall: [] };
  }
  const payload = await getArchivePayload();
  const collection = payload.collections.find(
    (item) => item.key === view.collectionKey,
  );
  if (!collection) {
    return { note: "", records: [], wall: [] };
  }
  const lookedAt =
    view.scope === "record" && view.recordId
      ? collection.stations.find((station) => station.id === view.recordId)
      : undefined;
  const stations = lookedAt ? [lookedAt] : collection.stations.slice(0, 12);
  const note = lookedAt
    ? `The viewer is looking at the record "${lookedAt.dc_title}" (${lookedAt.display_year}) in the gallery "${collection.title}" (${collection.period}).`
    : `The viewer is standing in the gallery "${collection.title}" (${collection.period}). ${collection.summary}`;
  const uuidIds = stations
    .map((station) => station.id)
    .filter((id) => z.string().uuid().safeParse(id).success);
  const records = await recordsByIds(uuidIds);
  const found = new Set(records.map((record) => record.id));
  const wall = stations
    .filter((station) => !found.has(station.id))
    .map((station) => ({
      id: station.id,
      title: station.dc_title,
      description: station.dc_description,
      dateText: station.date_text ?? station.display_year,
      place: station.dcterms_spatial,
      subjects: station.dc_subject,
      collectionKey: view.collectionKey,
    }));
  return { note, records, wall };
}

/**
 * SOURCE OF TRUTH KEYWORDS: selectEvidence, ScoredEvidenceRecord, EVIDENCE_LIMIT, questionTokens, CatalogRecord
 * WHAT: Orders the gathered records by how many question words they contain and keeps a wide set.
 * WHY: Alphabetical catalog order hides a matching article behind the first photographs.
 * WHERE: askArchive, before the summary prompt.
 */
function selectEvidence(
  question: string,
  records: readonly CatalogRecord[],
): CatalogRecord[] {
  const tokens = questionTokens(question);
  const scored: ScoredEvidenceRecord[] = records.map((record) => {
    const title = record.dc_title.toLowerCase();
    const haystack =
      `${title} ${record.dc_description ?? ""} ${record.dc_creator ?? ""} ${record.date_text ?? ""} ${record.dcterms_temporal ?? ""}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) {
        score += 3;
      } else if (haystack.includes(token)) {
        score += 1;
      }
    }
    return {
      record,
      score,
      descriptionLength: record.dc_description?.length ?? 0,
    };
  });
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      right.descriptionLength - left.descriptionLength ||
      left.record.dc_title.localeCompare(right.record.dc_title),
  );
  return scored.slice(0, EVIDENCE_LIMIT).map((entry) => entry.record);
}

/**
 * SOURCE OF TRUTH KEYWORDS: askArchive, /api/ask, SearchQuery, claimLines, AskResponse
 * WHAT: Translates a question into search filters, retrieves records, and summarizes only those records with strict citation grounding.
 * WHY: The model is not allowed to answer from general knowledge or emit uncited claims.
 * WHERE: app/api/ask/route.ts.
 */
export async function askArchive(
  question: string,
  view?: AskView,
  modelAdapter: LanguageModelPort = defaultModelAdapter,
): Promise<AskResponse> {
  const names = await askVocabulary();
  const filters = filtersFromQuestion(question, names);
  const queries = [
    ...(hasSearchFilter(filters) ? [filters] : []),
    ...companionQueries(question, filters),
  ];
  const emptyCatalogRecords: CatalogRecord[] = [];
  const [viewed, globalRecords, ...pages] = await Promise.all([
    recordsInView(view),
    view
      ? Promise.resolve(emptyCatalogRecords)
      : globalQuestionSearch(question),
    ...queries.map((query) => searchRecords(query, { limit: EVIDENCE_POOL })),
  ]);
  const strict = hasSearchFilter(filters) ? pages[0] : undefined;
  const withoutKeyword = pages.find(
    (page, index) =>
      index > 0 &&
      !page.filters.q &&
      page.filters.place === filters.place &&
      page.filters.subject === filters.subject &&
      page.filters.institution === filters.institution &&
      page.filters.creator === filters.creator &&
      page.filters.type === filters.type &&
      page.count > 0,
  );
  const search =
    strict && strict.count > 0
      ? strict
      : (withoutKeyword ?? { count: 0, filters, results: [] });
  if (
    search.results.length === 0 &&
    globalRecords.length === 0 &&
    pages.every((page) => page.results.length === 0) &&
    viewed.records.length === 0 &&
    viewed.wall.length === 0
  ) {
    return askResponseSchema.parse({
      question,
      filters,
      count: 0,
      claims: [{ text: noArchiveSourceMessage, citedRecordIds: [] }],
      summary: noArchiveSourceMessage,
      citations: [],
    });
  }

  const gathered = [
    ...new Map(
      [...pages.flatMap((page) => page.results), ...globalRecords].map(
        (record) => [record.id, record],
      ),
    ).values(),
  ];
  const viewedIds = new Set(viewed.records.map((record) => record.id));
  const ranked = selectEvidence(
    question,
    gathered.filter((record) => !viewedIds.has(record.id)),
  );
  const records = [...viewed.records, ...ranked].slice(0, EVIDENCE_LIMIT);
  const wallById = new Map(
    viewed.wall.map((record) => [record.id.toLowerCase(), record]),
  );
  const summaryPrompt = [
    viewed.note,
    `Question: ${question}`,
    "Answer in natural spoken language, as a guide in the archive would, using only the records in the JSON and the viewer line above.",
    "Do not add history, context, or facts that are not written there. Do not mention searches, filters, counts, or record ids.",
    "When the viewer line names a record or gallery, answer about that unless the question clearly asks about something else.",
    "The first claim must answer the question in plain words. If none of the records state that fact, the first claim must say so.",
    "Then cover the people, places, dates, and documents in the records that bear on the question, so the claims read together as one answer.",
    "Return claims. Each claim is one or two plain sentences in text, and recordIds lists every record that sentence cites.",
    "A claim that uses a record must put that record in recordIds. Those ids are the in-text citations.",
    "Every recordIds value must be copied from the records. If a fact is not in a record, omit it.",
    "Do not put a record id inside text.",
    "A date may be mentioned only when that same record's date, dateText, timePeriod, or description writes it.",
    "Write up to 6 claims.",
    JSON.stringify([
      ...viewed.wall.map((record) => ({
        id: record.id,
        title: record.title,
        type: "record",
        publisher: "",
        creator: null,
        date: null,
        dateText: record.dateText,
        place: record.place,
        timePeriod: null,
        subjects: record.subjects,
        description: record.description?.slice(0, 280) ?? null,
      })),
      ...records.map(recordBrief),
    ]),
  ].join("\n");

  let grounded: AskClaim[] = [];
  try {
    const drafted = await modelAdapter.generateClaims({
      prompt: summaryPrompt,
      maxOutputTokens: 1400,
    });
    grounded = groundClaims(drafted.claims ?? [], records, wallById);
  } catch {
    grounded = [];
  }

  const lines = grounded.map(
    (claim) =>
      `${claim.text} ${claim.citedRecordIds.map((id) => `[${id}]`).join(" ")}`,
  );

  const citedRecordIdSet = new Set(
    grounded.flatMap((claim) =>
      claim.citedRecordIds.map((id) => id.toLowerCase()),
    ),
  );
  const cited = records.filter((record) =>
    citedRecordIdSet.has(record.id.toLowerCase()),
  );
  const citedWall = viewed.wall.filter((record) =>
    citedRecordIdSet.has(record.id.toLowerCase()),
  );
  const lead = countLead(
    Math.max(search.count, gathered.length),
    records.length,
  );
  const body =
    lines.length > 0 ? lines.join("\n\n") : noDirectAnswerMessage;
  const summary = `${lead}\n\n${body}\n\nSources:\n${sourceBlock(records)}`;

  const claims: AskClaim[] =
    grounded.length > 0
      ? grounded
      : [{ text: noDirectAnswerMessage, citedRecordIds: [] }];

  return askResponseSchema.parse({
    question,
    filters: search.filters,
    count: Math.max(search.count, gathered.length),
    claims,
    summary,
    citations: [
      ...citedWall.map((record) => ({
        id: record.id,
        title: record.title,
        collectionKey: record.collectionKey,
      })),
      ...evidenceCitations(cited.length > 0 ? cited : records.slice(0, 8)),
    ],
  });
}
