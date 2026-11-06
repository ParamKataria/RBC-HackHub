import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  askResponseSchema,
  noArchiveSourceMessage,
  type AskCitation,
  type AskResponse,
  type AskView,
} from "@/src/types/ask";
import type { CatalogRecord } from "@/src/types/catalog";
import type { CollectionKey } from "@/src/types/museum";
import { recordTypeValues, searchQuerySchema, type SearchQuery, type SearchResponse } from "@/src/types/search";
import { z } from "zod";

import { getArchivePayload } from "./archive";
import { recordsByIds, searchRecords } from "./search";

const EVIDENCE_LIMIT = 32;
const EVIDENCE_POOL = 80;

const MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"];

const RECORD_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const nameRowsSchema = z.array(z.object({ name: z.string() }));

const filterDraftSchema = z.object({
  q: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  place: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
});

const modelClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string(),
        recordIds: z.array(z.string()),
      }),
    )
    .nullable()
    .optional(),
});

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

const filterJsonSchema = {
  type: "object",
  properties: {
    q: { type: "string" },
    institution: { type: "string" },
    type: { type: "string" },
    subject: { type: "string" },
    place: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
  },
  required: ["q", "institution", "type", "subject", "place", "from", "to"],
} as const;

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
} as const;

/**
 * SOURCE OF TRUTH KEYWORDS: geminiModels, GEMINI_MODEL, gemini-3.1-flash-lite
 * WHAT: Model order for the server-side Gemini calls.
 * WHY: GEMINI_MODEL overrides the default, and the next models cover a 404 or a temporary overload.
 * WHERE: generateJson.
 */
function geminiModels(): string[] {
  const chosen = process.env.GEMINI_MODEL?.trim();
  if (!chosen) {
    return MODELS;
  }
  return [chosen, ...MODELS.filter((model) => model !== chosen)];
}

/**
 * SOURCE OF TRUTH KEYWORDS: stripJsonFence, Gemini JSON, generateJson
 * WHAT: Removes a markdown fence around a JSON payload.
 * WHY: Structured output is usually raw JSON, and a fenced reply still has to parse.
 * WHERE: generateJson.
 */
function stripJsonFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

/**
 * SOURCE OF TRUTH KEYWORDS: generateJson, GEMINI_API_KEY, responseJsonSchema, /api/ask
 * WHAT: Calls Gemini and returns the JSON object it was told to produce.
 * WHY: Filter translation and the summary both stay on the server, and the API key never reaches the browser.
 * WHERE: askArchive.
 */
async function generateJson(
  prompt: string,
  responseJsonSchema: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  let lastMessage = "Gemini request failed";
  for (const model of geminiModels()) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema,
          },
        }),
      },
    );
    const payload: unknown = await response.json();
    const parsed = geminiResponseSchema.safeParse(payload);
    if (!response.ok) {
      lastMessage = parsed.success
        ? (parsed.data.error?.message ?? lastMessage)
        : lastMessage;
      if (response.status === 404 || response.status === 429 || response.status === 503) {
        continue;
      }
      throw new Error(lastMessage);
    }
    const text =
      parsed.success
        ? (parsed.data.candidates?.[0]?.content?.parts
            ?.filter((part) => !part.thought && part.text)
            .map((part) => part.text)
            .join("") ?? "")
        : "";
    if (!text) {
      lastMessage = "Gemini returned an empty response";
      continue;
    }
    const parsedJson: unknown = JSON.parse(stripJsonFence(text));
    return parsedJson;
  }
  throw new Error(lastMessage);
}

/**
 * SOURCE OF TRUTH KEYWORDS: askVocabulary, sources, subjects, institution, subject
 * WHAT: Loads the publisher and subject headings the translator is allowed to emit.
 * WHY: institution and subject filters match those strings exactly.
 * WHERE: askArchive, before the filter translation.
 */
async function askVocabulary(): Promise<{ publishers: string[]; subjects: string[] }> {
  const supabase = await createClient();
  const [sourcesResult, subjectsResult] = await Promise.all([
    supabase.from("sources").select("name").order("name"),
    supabase.from("subjects").select("name").order("name"),
  ]);
  if (sourcesResult.error) {
    throw new Error(sourcesResult.error.message);
  }
  if (subjectsResult.error) {
    throw new Error(subjectsResult.error.message);
  }
  return {
    publishers: nameRowsSchema.parse(sourcesResult.data).map((row) => row.name),
    subjects: nameRowsSchema.parse(subjectsResult.data).map((row) => row.name),
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: normalizeFilters, SearchQuery, institution, place, from
 * WHAT: Turns the model filter JSON into a SearchQuery.
 * WHY: A publisher, subject, type, or date the catalog cannot match is dropped before the search runs.
 * WHERE: askArchive, after the translation call.
 */
function normalizeFilters(
  value: unknown,
  publishers: readonly string[],
  subjects: readonly string[],
): SearchQuery {
  const draft = filterDraftSchema.parse(value);
  const text = (field: string | null | undefined): string | undefined => {
    const trimmed = field?.trim();
    return trimmed ? trimmed : undefined;
  };
  const institution = publishers.find(
    (publisher) => publisher.toLowerCase() === text(draft.institution)?.toLowerCase(),
  );
  const subject = subjects.find(
    (heading) => heading.toLowerCase() === text(draft.subject)?.toLowerCase(),
  );
  const type = recordTypeValues.find(
    (recordType) => recordType === text(draft.type)?.toLowerCase(),
  );
  const isoDate = (field: string | null | undefined): string | undefined => {
    const trimmed = text(field);
    return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
  };
  let from = isoDate(draft.from);
  let to = isoDate(draft.to);
  if (from && to && from > to) {
    from = undefined;
    to = undefined;
  }

  return searchQuerySchema.parse({
    q: text(draft.q),
    institution,
    type,
    subject,
    place: text(draft.place),
    from,
    to,
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: hasSearchFilter, SearchQuery, empty question, no source
 * WHAT: Reports whether a translated query narrows the catalog.
 * WHY: An empty filter set would list every record and is not a grounded match.
 * WHERE: askArchive, before searchRecords.
 */
function hasSearchFilter(filters: SearchQuery): boolean {
  return Boolean(
    filters.q ||
      filters.institution ||
      filters.type ||
      filters.subject ||
      filters.place ||
      filters.from ||
      filters.to,
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordBrief, CatalogRecord, evidence, summary prompt
 * WHAT: Copies the stored fields the summary model is allowed to read.
 * WHY: The model must not see raw metadata or fields that were not retrieved for this question.
 * WHERE: The summary prompt inside askArchive.
 */
function recordBrief(record: CatalogRecord): {
  id: string;
  title: string;
  type: string;
  publisher: string;
  date: string | null;
  dateText: string | null;
  place: string | null;
  timePeriod: string | null;
  subjects: string[];
  description: string | null;
} {
  return {
    id: record.id,
    title: record.dc_title,
    type: record.dc_type,
    publisher: record.dc_publisher,
    date: record.dc_date,
    dateText: record.date_text,
    place: record.dcterms_spatial,
    timePeriod: record.dcterms_temporal,
    subjects: record.dc_subject,
    description: record.dc_description?.slice(0, 500) ?? null,
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: evidenceCitations, AskCitation, record id, Sources
 * WHAT: Builds one citation per retrieved record, using the stored title.
 * WHY: Citation titles come from the catalog, not from the model.
 * WHERE: The ask response citations array.
 */
function evidenceCitations(records: readonly CatalogRecord[]): AskCitation[] {
  return records.map((record) => ({ id: record.id, title: record.dc_title }));
}

/**
 * SOURCE OF TRUTH KEYWORDS: citedRecords, record id, AskCitation, claimLines
 * WHAT: Keeps the records named by the summary sentences, in the order they are used.
 * WHY: The model reads a wide set, and the panel should link the records that sentence actually used.
 * WHERE: askArchive, when building the response citations.
 */
function citedRecords(lines: readonly string[], records: readonly CatalogRecord[]): CatalogRecord[] {
  const byId = new Map(records.map((record) => [record.id.toLowerCase(), record]));
  const chosen: CatalogRecord[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const id of line.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []) {
      const record = byId.get(id.toLowerCase());
      if (!record || seen.has(record.id)) continue;
      seen.add(record.id);
      chosen.push(record);
    }
  }
  return chosen;
}

/**
 * SOURCE OF TRUTH KEYWORDS: sourceBlock, record id, Sources, citation
 * WHAT: Lists every retrieved record as a title plus its record id.
 * WHY: The answer text cites each record id that was given to the model.
 * WHERE: The summary Sources section.
 */
function sourceBlock(records: readonly CatalogRecord[]): string {
  return records.map((record) => `${record.dc_title} [${record.id}]`).join("\n");
}

/**
 * SOURCE OF TRUTH KEYWORDS: countLead, evidence limit, matching records
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
 * SOURCE OF TRUTH KEYWORDS: claimLines, recordIds, citation, grounded summary
 * WHAT: Keeps summary sentences whose record ids all belong to the retrieved set.
 * WHY: A sentence that cites an unknown id is dropped instead of being shown.
 * WHERE: askArchive, after the summary model returns.
 */
function claimLines(
  claims: readonly { text: string; recordIds: string[] }[],
  records: readonly CatalogRecord[],
  extraIds: ReadonlyMap<string, unknown> = new Map(),
): string[] {
  const idsByLower = new Map(records.map((record) => [record.id.toLowerCase(), record.id]));
  for (const id of extraIds.keys()) {
    idsByLower.set(id.toLowerCase(), id);
  }
  const lines: string[] = [];
  for (const claim of claims) {
    const requested = [...new Set(claim.recordIds.map((id) => id.trim().toLowerCase()))];
    const resolved = requested.map((id) => idsByLower.get(id));
    if (requested.length === 0) {
      const strayIds = claim.text.match(RECORD_ID_PATTERN) ?? [];
      if (strayIds.some((id) => !idsByLower.has(id.toLowerCase()))) {
        continue;
      }
      const bare = claim.text.replace(RECORD_ID_PATTERN, " ").replace(/\s+/g, " ").trim();
      if (bare) lines.push(bare);
      continue;
    }
    if (resolved.some((id) => !id)) {
      continue;
    }
    const mentioned = claim.text.match(RECORD_ID_PATTERN) ?? [];
    if (mentioned.some((id) => !idsByLower.has(id.toLowerCase()))) {
      continue;
    }
    const text = claim.text.replace(RECORD_ID_PATTERN, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    const citedIds = resolved.filter((id): id is string => Boolean(id));
    lines.push(`${text} ${citedIds.map((id) => `[${id}]`).join(" ")}`);
  }
  return lines;
}

/**
 * SOURCE OF TRUTH KEYWORDS: broadenSearch, SearchQuery, empty q, subject place
 * WHAT: Repeats a search without the keyword filter when the full filter set matches nothing.
 * WHY: A question like "what year was Africville founded" should still retrieve Africville records when "founded" is not stored on them.
 * WHERE: askArchive, after the first searchRecords call.
 */
async function broadenSearch(filters: SearchQuery): Promise<SearchResponse> {
  const first = await searchRecords(filters, { limit: EVIDENCE_POOL });
  if (first.count > 0 || !filters.q) {
    return first;
  }
  const hasOtherFilter = Boolean(
    filters.institution || filters.type || filters.subject || filters.place || filters.from || filters.to,
  );
  if (!hasOtherFilter) {
    return first;
  }
  return searchRecords({ ...filters, q: undefined }, { limit: EVIDENCE_POOL });
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
 * SOURCE OF TRUTH KEYWORDS: questionTokens, QUESTION_STOP_WORDS, SearchQuery
 * WHAT: Keeps the content words from a question.
 * WHY: Retrieval and ranking use the words the person asked, with no topic list of our own.
 * WHERE: gatherRecords and selectEvidence.
 */
function questionTokens(question: string): string[] {
  return (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 2 && !QUESTION_STOP_WORDS.has(token),
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: gatherRecords, place, subject, EVIDENCE_POOL, SearchQuery
 * WHAT: Unions the filtered search with the same name looked up as a place and as a subject.
 * WHY: One heading misses records filed under the other, and the summary can only use records it was given.
 * WHERE: askArchive, after broadenSearch.
 */
async function gatherRecords(
  question: string,
  filters: SearchQuery,
  primary: readonly CatalogRecord[],
): Promise<CatalogRecord[]> {
  const merged = new Map(primary.map((record) => [record.id, record]));
  const companions: SearchQuery[] = [];
  if (filters.place && filters.subject) {
    companions.push(searchQuerySchema.parse({ place: filters.place }));
    companions.push(searchQuerySchema.parse({ subject: filters.subject }));
  } else if (filters.subject) {
    companions.push(searchQuerySchema.parse({ place: filters.subject }));
  } else if (filters.place) {
    companions.push(searchQuerySchema.parse({ subject: filters.place }));
  }
  const words = questionTokens(question).filter(
    (token) => token !== filters.place?.toLowerCase() && token !== filters.subject?.toLowerCase(),
  );
  const scope = filters.place ?? filters.subject;
  if (scope && words.length > 0) {
    companions.push(
      searchQuerySchema.parse({
        q: words.join(" OR "),
        place: scope,
      }),
    );
  }
  for (const query of companions) {
    const extra = await searchRecords(query, { limit: EVIDENCE_POOL });
    for (const record of extra.results) {
      merged.set(record.id, record);
    }
  }
  return [...merged.values()];
}

/**
 * SOURCE OF TRUTH KEYWORDS: selectEvidence, EVIDENCE_LIMIT, questionTokens, CatalogRecord
 * WHAT: Orders the gathered records by how many question words they contain and keeps a wide set.
 * WHY: Alphabetical catalog order hides a matching article behind the first photographs.
 * WHERE: askArchive, before the summary prompt.
 */
type WallRecord = {
  id: string;
  title: string;
  description: string | null;
  dateText: string | null;
  place: string | null;
  subjects: string[];
  collectionKey: CollectionKey;
};

/**
 * SOURCE OF TRUTH KEYWORDS: recordsInView, AskView, getArchivePayload, recordsByIds
 * WHAT: Resolves the gallery, and the picture in front of the viewer, from the archive payload.
 * WHY: The browser only sends a collection key and record id. The text the model reads is loaded on the server.
 * WHERE: askArchive, before the summary prompt.
 */
async function recordsInView(view: AskView | undefined): Promise<{
  note: string;
  records: CatalogRecord[];
  wall: WallRecord[];
}> {
  if (!view) {
    return { note: "", records: [], wall: [] };
  }
  const payload = await getArchivePayload();
  const collection = payload.collections.find((item) => item.key === view.collectionKey);
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

function selectEvidence(question: string, records: readonly CatalogRecord[]): CatalogRecord[] {
  const tokens = questionTokens(question);
  const scored = records.map((record) => {
    const title = record.dc_title.toLowerCase();
    const haystack = `${title} ${record.dc_description ?? ""} ${record.date_text ?? ""} ${record.dcterms_temporal ?? ""}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) score += 3;
      else if (haystack.includes(token)) score += 1;
    }
    return { record, score, descriptionLength: record.dc_description?.length ?? 0 };
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
 * SOURCE OF TRUTH KEYWORDS: askArchive, /api/ask, SearchQuery, citation, Gemini
 * WHAT: Translates a question into search filters, retrieves records, and summarizes only those records.
 * WHY: The model is not allowed to answer from general knowledge. No matching records produces a no-source reply.
 * WHERE: app/api/ask/route.ts.
 */
export async function askArchive(question: string, view?: AskView): Promise<AskResponse> {
  const { publishers, subjects } = await askVocabulary();
  const filterPrompt = [
    "Translate the archive question into search filters. Do not answer the question.",
    "Return every key. Use an empty string when a filter does not apply.",
    `institution must be empty or exactly one of: ${publishers.join(" | ")}`,
    `type must be empty or exactly one of: ${recordTypeValues.join(" | ")}`,
    `subject must be empty or exactly one of: ${subjects.join(" | ")}`,
    "subject is an exact heading. Leave it empty unless the question names that heading.",
    "A community or place name goes in place, even when the same words exist as a subject heading.",
    "place is only the place name, such as Preston.",
    "q is a few keywords that appear in a title or description. Leave q empty when place, institution, type, or subject already identifies the records.",
    "Do not put century labels such as 1800s or 19th century in q, from, or to. Those words are not stored on the records.",
    "from and to are YYYY-MM-DD only when the question gives a specific calendar day. Otherwise leave them empty. A year written as 1818 or 27 June 1832 is not an ISO date.",
    "There is no community filter. Do not invent one.",
    'Example question: "records about Black communities in Preston in the 1800s"',
    'Example filters: {"q":"","institution":"","type":"","subject":"","place":"Preston","from":"","to":""}',
    `Question: ${question}`,
  ].join("\n");

  const filters = normalizeFilters(
    await generateJson(filterPrompt, filterJsonSchema),
    publishers,
    subjects,
  );

  const viewed = await recordsInView(view);
  if (!hasSearchFilter(filters) && viewed.records.length === 0 && viewed.wall.length === 0) {
    return askResponseSchema.parse({
      question,
      filters,
      count: 0,
      summary: noArchiveSourceMessage,
      citations: [],
    });
  }

  const search = hasSearchFilter(filters)
    ? await broadenSearch(filters)
    : { count: 0, filters, results: [] };
  if (
    (search.count === 0 || search.results.length === 0) &&
    viewed.records.length === 0 &&
    viewed.wall.length === 0
  ) {
    return askResponseSchema.parse({
      question,
      filters,
      count: 0,
      summary: noArchiveSourceMessage,
      citations: [],
    });
  }

  const gathered = hasSearchFilter(filters)
    ? await gatherRecords(question, search.filters, search.results)
    : [];
  const viewedIds = new Set(viewed.records.map((record) => record.id));
  const ranked = selectEvidence(
    question,
    gathered.filter((record) => !viewedIds.has(record.id)),
  );
  const records = [...viewed.records, ...ranked].slice(0, EVIDENCE_LIMIT);
  const wallById = new Map(viewed.wall.map((record) => [record.id.toLowerCase(), record]));
  const summaryPrompt = [
    viewed.note,
    `Question: ${question}`,
    "Answer that question using only the archive records in the JSON and the viewer line above. Do not add history, context, or facts that are not written there.",
    "When the viewer line names a record or gallery, answer about that unless the question clearly asks about something else.",
    "The first claim must answer the question. If none of the records state that fact, the first claim must say so.",
    "Return claims. Each claim is one sentence in text, and recordIds lists the record ids that sentence uses.",
    "Every recordIds value must be copied from the records. If a fact is not in a record, omit it.",
    "Do not put a record id inside text.",
    "A date may be mentioned only when that same record's date, dateText, timePeriod, or description writes it.",
    "Write at most 4 claims.",
    JSON.stringify([
      ...viewed.wall.map((record) => ({
        id: record.id,
        title: record.title,
        type: "record",
        publisher: "",
        date: null,
        dateText: record.dateText,
        place: record.place,
        timePeriod: null,
        subjects: record.subjects,
        description: record.description?.slice(0, 500) ?? null,
      })),
      ...records.map(recordBrief),
    ]),
  ].join("\n");

  let lines: string[] = [];
  try {
    const drafted = modelClaimsSchema.parse(
      await generateJson(summaryPrompt, claimsJsonSchema),
    );
    lines = claimLines(drafted.claims ?? [], records, wallById);
  } catch {
    lines = [];
  }

  const cited = citedRecords(lines, records);
  const citedWall = viewed.wall.filter((record) =>
    lines.some((line) => line.toLowerCase().includes(record.id.toLowerCase())),
  );
  const lead = countLead(Math.max(search.count, gathered.length), records.length);
  const body =
    lines.length > 0
      ? lines.join("\n\n")
      : "These records do not answer that. The matching records are listed below.";
  const summary = `${lead}\n\n${body}\n\nSources:\n${sourceBlock(records)}`;

  return askResponseSchema.parse({
    question,
    filters: search.filters,
    count: Math.max(search.count, gathered.length),
    summary,
    citations: [
      ...citedWall.map((record) => ({
        id: record.id,
        title: record.title,
        collectionKey: record.collectionKey,
      })),
      ...evidenceCitations(cited.length > 0 ? cited : records),
    ].slice(0, 4),
  });
}
