import { askService } from "@/lib/services";
import { askQuestionSchema } from "@/src/types";
import { type NextRequest } from "next/server";
import { ZodError } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: /api/ask, AskQuestion, citation, Gemini, SearchQuery
 * WHAT: POST /api/ask turns a question into filters, searches, and returns a cited summary.
 * WHY: The Gemini calls stay on the server, and a question with no matching records returns the no-source sentence.
 * WHERE: /api/ask with JSON { question, view? }.
 */
export async function POST(request: NextRequest) {
  try {
    const payload: unknown = await request.json();
    const { question, view } = askQuestionSchema.parse(payload);
    const result = await askService.askArchive(question, view);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Invalid question";
      return Response.json({ error: message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid question" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Ask failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
