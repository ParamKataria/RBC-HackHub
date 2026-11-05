import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  askResponseSchema,
  noArchiveSourceMessage,
  type AskCitation,
  type AskResponse,
} from "@/src/types/ask";
import type { CatalogRecord } from "@/src/types/catalog";
import { recordTypeValues, searchQuerySchema, type SearchQuery } from "@/src/types/search";
import { z } from "zod";

import { searchRecords } from "./search";

const EVIDENCE_LIMIT = 8;

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
): string[] {
  const idsByLower = new Map(records.map((record) => [record.id.toLowerCase(), record.id]));
  const lines: string[] = [];
  for (const claim of claims) {
    const requested = [...new Set(claim.recordIds.map((id) => id.trim().toLowerCase()))];
    const resolved = requested.map((id) => idsByLower.get(id));
    if (requested.length === 0 || resolved.some((id) => !id)) {
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
 * SOURCE OF TRUTH KEYWORDS: askArchive, /api/ask, SearchQuery, citation, Gemini
 * WHAT: Translates a question into search filters, retrieves records, and summarizes only those records.
 * WHY: The model is not allowed to answer from general knowledge. No matching records produces a no-source reply.
 * WHERE: app/api/ask/route.ts.
 */
export async function askArchive(question: string): Promise<AskResponse> {
  const { publishers, subjects } = await askVocabulary();
  const filterPrompt = [
    "Translate the archive question into search filters. Do not answer the question.",
    "Return every key. Use an empty string when a filter does not apply.",
    `institution must be empty or exactly one of: ${publishers.join(" | ")}`,
    `type must be empty or exactly one of: ${recordTypeValues.join(" | ")}`,
    `subject must be empty or exactly one of: ${subjects.join(" | ")}`,
    "subject is an exact heading. Leave it empty unless the question names that heading.",
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

  if (!hasSearchFilter(filters)) {
    return askResponseSchema.parse({
      question,
      filters,
      count: 0,
      summary: noArchiveSourceMessage,
      citations: [],
    });
  }

  const search = await searchRecords(filters, { limit: EVIDENCE_LIMIT });
  if (search.count === 0 || search.results.length === 0) {
    return askResponseSchema.parse({
      question,
      filters,
      count: 0,
      summary: noArchiveSourceMessage,
      citations: [],
    });
  }

  const records = search.results;
  const summaryPrompt = [
    "Summarize only the archive records in the JSON. Do not add history, context, or facts that are not written in those records.",
    "Return claims. Each claim is one sentence in text, and recordIds lists the record ids that sentence uses.",
    "Every recordIds value must be copied from the records. If a fact is not in a record, omit it.",
    "Do not put a record id inside text.",
    "Only mention a date when that record's date, dateText, or timePeriod contains it.",
    "Write at most 6 claims.",
    JSON.stringify(records.map(recordBrief)),
  ].join("\n");

  let lines: string[] = [];
  try {
    const drafted = modelClaimsSchema.parse(
      await generateJson(summaryPrompt, claimsJsonSchema),
    );
    lines = claimLines(drafted.claims ?? [], records);
  } catch {
    lines = [];
  }

  const lead = countLead(search.count, records.length);
  const body =
    lines.length > 0
      ? lines.join("\n\n")
      : "No model summary was kept. The sources below are the matching records.";
  const summary = `${lead}\n\n${body}\n\nSources:\n${sourceBlock(records)}`;

  return askResponseSchema.parse({
    question,
    filters: search.filters,
    count: search.count,
    summary,
    citations: evidenceCitations(records),
  });
}
