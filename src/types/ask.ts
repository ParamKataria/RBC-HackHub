import { z } from "zod";

import { searchQuerySchema } from "./search";

/**
 * SOURCE OF TRUTH KEYWORDS: AskQuestion, AskCitation, AskResponse, /api/ask, record id
 * WHAT: Validated question and grounded answer for Ask the Archive.
 * WHY: The model may only summarize records returned by the structured search, and every citation must be a real record id.
 * WHERE: lib/services/ask.ts, app/api/ask/route.ts, and the catalog ask form.
 */

export const noArchiveSourceMessage =
  "No records in the archive match this question.";

export const askQuestionSchema = z.object({
  question: z.string().trim().min(1, "Enter a question").max(500),
});

export type AskQuestion = z.infer<typeof askQuestionSchema>;

export const askCitationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
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
