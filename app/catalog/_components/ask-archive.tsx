"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  askResponseSchema,
  noArchiveSourceMessage,
  type AskResponse,
  type SearchQuery,
} from "@/src/types";

const RECORD_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * SOURCE OF TRUTH KEYWORDS: filterHref, SearchQuery, /catalog, /api/ask
 * WHAT: Builds the catalog URL for the filters the question was translated into.
 * WHY: The test page can open the same structured search the summary used.
 * WHERE: The ask result, under the summary.
 */
function filterHref(filters: SearchQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: CitedSummary, record id, citation, /catalog/[id]
 * WHAT: Renders the summary and links each cited record id to its catalog page.
 * WHY: A record id in the answer is only a link when that id was returned as a citation.
 * WHERE: AskArchive result.
 */
function CitedSummary({ result }: { result: AskResponse }) {
  const titles = new Map(result.citations.map((citation) => [citation.id.toLowerCase(), citation]));
  const parts = result.summary.split(RECORD_ID_PATTERN);
  const ids = result.summary.match(RECORD_ID_PATTERN) ?? [];

  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
      {parts.map((part, index) => {
        const recordId = ids[index];
        const citation = titles.get(recordId?.toLowerCase() ?? "");
        return (
          <span key={`${index}-${part.slice(0, 12)}`}>
            {part}
            {citation ? (
              <Link
                href={`/catalog/${citation.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {citation.id}
              </Link>
            ) : (
              recordId
            )}
          </span>
        );
      })}
    </p>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: AskArchive, /api/ask, citation, question, catalog
 * WHAT: Question box that posts to the grounded ask route and shows cited records.
 * WHY: The catalog page is the test screen for natural-language questions.
 * WHERE: Catalog index, above the structured filters.
 */
export function AskArchive() {
  const [question, setQuestion] = useState(
    "records about Black communities in Preston in the 1800s",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Ask failed";
        setResult(null);
        setError(message);
        return;
      }
      const parsed = askResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setResult(null);
        setError("Ask failed");
        return;
      }
      setResult(parsed.data);
    } catch {
      setResult(null);
      setError("Ask failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask the archive</CardTitle>
        <CardDescription>
          A question is turned into search filters. The answer summarizes only the
          records that search returns, and each record id links to the catalog.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Question
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm"
            />
          </label>
          <div>
            <Button type="submit" disabled={pending || question.trim().length === 0}>
              {pending ? "Searching records…" : "Ask"}
            </Button>
          </div>
        </form>
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-col gap-3">
            <CitedSummary result={result} />
            {result.summary === noArchiveSourceMessage ? null : (
              <p className="text-sm text-muted-foreground">
                Filters{" "}
                <Link
                  href={filterHref(result.filters)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {filterHref(result.filters)}
                </Link>
              </p>
            )}
            {result.citations.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {result.citations.map((citation) => (
                  <li key={citation.id}>
                    <Link
                      href={`/catalog/${citation.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {citation.title}
                    </Link>
                    <span className="text-muted-foreground"> · {citation.id}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
