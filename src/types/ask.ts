import { z } from "zod";

import { collectionKeySchema } from "./museum";
import { searchQuerySchema } from "./search";

/**
 * SOURCE OF TRUTH KEYWORDS: AskQuestion, AskCitation, AskResponse, /api/ask, record id
 * WHAT: Validated question and grounded answer for Ask the Archive.
 * WHY: The model may only summarize records returned by the structured search, and every citation must be a real record id.
 * WHERE: lib/services/ask.ts, app/api/ask/route.ts, the catalog ask form, and the rotunda header ask field.
 */

export const noArchiveSourceMessage =
  "No records in the archive match this question.";

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

export const askResponseSchema = z.object({
  question: z.string(),
  filters: searchQuerySchema,
  count: z.number().int().nonnegative(),
  summary: z.string(),
  citations: z.array(askCitationSchema),
});

export type AskResponse = z.infer<typeof askResponseSchema>;

export const askErrorSchema = z.object({
  error: z.string(),
});

export type AskError = z.infer<typeof askErrorSchema>;
