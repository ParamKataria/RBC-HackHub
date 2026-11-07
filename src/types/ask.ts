import { z } from "zod";

import { catalogRecordSchema } from "./catalog";
import { collectionKeySchema } from "./museum";
import { searchQuerySchema } from "./search";

/**
 * SOURCE OF TRUTH KEYWORDS: AskQuestion, AskCitation, AskResponse, AskModelClaim, WallRecord, AskVocabulary
 * WHAT: Validated question, model claim schemas, vocabulary types, and grounded answer types for Ask the Archive.
 * WHY: The model may only summarize records returned by the structured search, and every citation must resolve to a real retrieved record id.
 * WHERE: lib/services/ask.ts, app/api/ask/route.ts, the catalog ask form, and the rotunda header ask field.
 */

export const noArchiveSourceMessage =
  "No records in the archive match this question.";

export const noDirectAnswerMessage =
  "These records do not answer that. The matching records are listed below.";

export const askViewSchema = z.object({
  scope: z.enum(["room", "record"]),
  collectionKey: collectionKeySchema,
  recordId: z.string().trim().min(1).max(80).optional(),
});

export type AskView = z.infer<typeof askViewSchema>;

export const askQuestionSchema = z.object({
  question: z.string().trim().min(1, "Enter a question").max(500),
  view: askViewSchema.optional(),
});

export type AskQuestion = z.infer<typeof askQuestionSchema>;

export const askCitationSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string(),
  collectionKey: collectionKeySchema.optional(),
});

export type AskCitation = z.infer<typeof askCitationSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: askClaimSchema, AskClaim, citedRecordIds, GroundedClaim, InquiryEngine
 * WHAT: Validated factual claim linking narrative text to verified catalog record IDs.
 * WHY: Eliminates client-side regex parsing by preserving structured claims directly from the inquiry engine.
 * WHERE: src/types/ask.ts, lib/services/ask.ts, and src/components/archive/archive-answer.tsx.
 */
export const askClaimSchema = z.object({
  text: z.string(),
  citedRecordIds: z.array(z.string()),
});

export type AskClaim = z.infer<typeof askClaimSchema>;

export const askResponseSchema = z.object({
  question: z.string(),
  filters: searchQuerySchema,
  count: z.number().int().nonnegative(),
  claims: z.array(askClaimSchema).default([]),
  summary: z.string().default(""),
  citations: z.array(askCitationSchema),
});

export type AskResponse = z.infer<typeof askResponseSchema>;

export const askErrorSchema = z.object({
  error: z.string(),
});

export type AskError = z.infer<typeof askErrorSchema>;

export const nameRowsSchema = z.array(
  z.object({
    name: z.string(),
  }),
);

export type NameRows = z.infer<typeof nameRowsSchema>;

export const askModelClaimSchema = z.object({
  text: z.string(),
  recordIds: z.array(z.string()),
});

export type AskModelClaim = z.infer<typeof askModelClaimSchema>;

export const modelClaimsSchema = z.object({
  claims: z.array(askModelClaimSchema).nullable().optional(),
});

export type ModelClaims = z.infer<typeof modelClaimsSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: LanguageModelPort, LanguageModelInput, LanguageModelHandler, InMemoryModelAdapterConfig, languageModelInputSchema
 * WHAT: Seam interface, input schema, handler signature, and test double configuration for archive language models.
 * WHY: Decouples prompt execution from live Gemini network calls, allowing deterministic test doubles and pluggable model adapters.
 * WHERE: lib/services/ask.ts, lib/services/model-adapter.ts, app/api/ask/route.ts, and tests.
 */
export const languageModelInputSchema = z.object({
  prompt: z.string(),
  maxOutputTokens: z.number().int().positive().optional(),
});

export type LanguageModelInput = z.infer<typeof languageModelInputSchema>;

export type LanguageModelHandler = (
  input: LanguageModelInput,
) => Promise<ModelClaims> | ModelClaims;

export interface LanguageModelPort {
  generateClaims(
    input: LanguageModelInput | string,
    options?: { maxOutputTokens?: number },
  ): Promise<ModelClaims>;
}

export type InMemoryModelAdapterConfig = {
  claims?: ModelClaims | readonly AskModelClaim[];
  handler?: LanguageModelHandler;
  error?: Error | string | null;
};

export type InMemoryModelAdapterInput =
  | ModelClaims
  | readonly AskModelClaim[]
  | LanguageModelHandler
  | InMemoryModelAdapterConfig;

export const geminiResponseSchema = z.object({
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

export type GeminiResponse = z.infer<typeof geminiResponseSchema>;

export const askVocabularySchema = z.object({
  publishers: z.array(z.string()),
  subjects: z.array(z.string()),
  places: z.array(z.string()),
  people: z.array(z.string()).optional(),
});

export type AskVocabulary = z.infer<typeof askVocabularySchema>;

export const askVocabularyCacheSchema = askVocabularySchema.extend({
  expires: z.number(),
});

export type AskVocabularyCache = z.infer<typeof askVocabularyCacheSchema>;

export const recordBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  publisher: z.string(),
  creator: z.string().nullable(),
  date: z.string().nullable(),
  dateText: z.string().nullable(),
  place: z.string().nullable(),
  timePeriod: z.string().nullable(),
  subjects: z.array(z.string()),
  description: z.string().nullable(),
});

export type RecordBrief = z.infer<typeof recordBriefSchema>;

export const wallRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dateText: z.string().nullable(),
  place: z.string().nullable(),
  subjects: z.array(z.string()),
  collectionKey: collectionKeySchema,
});

export type WallRecord = z.infer<typeof wallRecordSchema>;

export const recordsInViewResultSchema = z.object({
  note: z.string(),
  records: z.array(z.lazy(() => catalogRecordSchema)),
  wall: z.array(wallRecordSchema),
});

export type RecordsInViewResult = z.infer<typeof recordsInViewResultSchema>;

export const scoredEvidenceRecordSchema = z.object({
  record: z.lazy(() => catalogRecordSchema),
  score: z.number(),
  descriptionLength: z.number().int().nonnegative(),
});

export type ScoredEvidenceRecord = z.infer<typeof scoredEvidenceRecordSchema>;

export const extraIdValueSchema = z.union([
  wallRecordSchema,
  z.lazy(() => catalogRecordSchema),
  z.string(),
  z.boolean(),
  z.number(),
  z.null(),
]);

export type ExtraIdValue = z.infer<typeof extraIdValueSchema>;

export const archiveGlanceSchema = z.object({
  id: z.string(),
  kicker: z.string(),
  title: z.string(),
  body: z.string(),
});

export type ArchiveGlance = z.infer<typeof archiveGlanceSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: searchModeSchema, SearchMode, dualModeSearch, keywordSearch, aiInquiry
 * WHAT: Validated search mode enum schema and TypeScript type distinguishing database keyword lookup from natural-language AI inquiries.
 * WHY: Provides domain typing across components, query synchronization, and accessible mode toggle controls.
 * WHERE: src/types/ask.ts, src/components/archive/archive-search-bar.tsx, and src/types/index.ts.
 */
export const searchModeSchema = z.enum(["keyword", "ai"]);

export type SearchMode = z.infer<typeof searchModeSchema>;

/**
 * SOURCE OF TRUTH KEYWORDS: ModeSwitchOptions, handleModeSwitch, SearchMode, filterPanelCollapse, aiModeSuppression
 * WHAT: Configuration options for search mode switching callbacks and filter panel collapse control.
 * WHY: Decouples mode transition contracts and avoids inline handwritten object typing across components and seams.
 * WHERE: src/types/ask.ts, src/components/archive/archive-search-bar.tsx, and src/types/index.ts.
 */
export interface ModeSwitchOptions {
  filterPanelOpen?: boolean;
  onToggleFilterPanel?: () => void;
  onCloseFilterPanel?: () => void;
  clearAiResults?: () => void;
}

/**
 * SOURCE OF TRUTH KEYWORDS: archiveSearchBarPropsSchema, ArchiveSearchBarProps, enableFilterPill, filterPanelOpen, activeFilterCount, onToggleFilterPanel
 * WHAT: Validated props schema and TypeScript interface for ArchiveSearchBar including dual-mode search configuration and filter pill integration.
 * WHY: Enforces type-safe configuration of navigation, CTA links, initial query hydration, callbacks, keyword vs AI mode toggles, and inline filter pill state.
 * WHERE: src/types/ask.ts, src/components/archive/archive-search-bar.tsx.
 */
export const archiveSearchBarPropsSchema = z.object({
  initialQuestion: z.string().optional(),
  autoNavigate: z.boolean().optional(),
  showCatalogCta: z.boolean().optional(),
  placeholder: z.string().optional(),
  claimLimit: z.number().int().positive().optional(),
  className: z.string().optional(),
  enableModeToggle: z.boolean().optional(),
  defaultMode: searchModeSchema.optional(),
  currentFilters: searchQuerySchema.optional(),
  enableFilterPill: z.boolean().optional(),
  filterPanelOpen: z.boolean().optional(),
  activeFilterCount: z.number().int().nonnegative().optional(),
  onQuestionChange: z.custom<((question: string) => void)>().optional(),
  onCloseFilterPanel: z.custom<(() => void)>().optional(),
  onToggleFilterPanel: z.custom<(() => void)>().optional(),
  onAnswer: z.custom<((answer: AskResponse) => void)>().optional(),
  onClear: z.custom<(() => void)>().optional(),
});

export type ArchiveSearchBarProps = z.infer<typeof archiveSearchBarPropsSchema>;

export const immersiveArchiveHUDPropsSchema = z.object({
  view: askViewSchema.nullable().optional(),
  glance: archiveGlanceSchema.nullable().optional(),
  placement: z.enum(["header", "view"]).optional(),
});

export type ImmersiveArchiveHUDProps = z.infer<typeof immersiveArchiveHUDPropsSchema>;

