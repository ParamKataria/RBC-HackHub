"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  askErrorSchema,
  askQuestionSchema,
  askResponseSchema,
  noArchiveSourceMessage,
  type AskCitation,
  type AskResponse,
  type AskView,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: shortAskAnswer, AskResponse, Sources, citation
 * WHAT: Keeps the first two grounded sentences and drops the record-id list.
 * WHY: The glass sheet should answer briefly. The full source list stays on the catalog page.
 * WHERE: ArchiveAsk overlay.
 */
function shortAskAnswer(summary: string): string {
  const withoutSources = summary.split(/\n\nSources:/)[0] ?? summary;
  const withoutLead = withoutSources.replace(/^The search matched[\s\S]*?\n\n/, "");
  const sentences = withoutLead
    .split(/\n\n/)
    .map((sentence) =>
      sentence.replace(/\s*\[[0-9a-f-]{36}\]/gi, "").replace(/\s+/g, " ").trim(),
    )
    .filter((sentence) => sentence.length > 0);
  return sentences.slice(0, 2).join(" ") || noArchiveSourceMessage;
}

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveAsk, /api/ask, askQuestionSchema, siriMorph
 * WHAT: Header question field that morphs from a glass pill into a short cited answer.
 * WHY: Typing must not call the model. The same surface thinks, then expands, the way Siri does on the Mac.
 * WHERE: BccnsArchiveExperience top bar.
 */
function citationHref(citation: AskCitation): string {
  const isCatalogId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    citation.id,
  );
  if (!isCatalogId && citation.collectionKey) {
    return `/?collection=${citation.collectionKey}&record=${citation.id}`;
  }
  return `/catalog/${citation.id}`;
}

export function ArchiveAsk({
  view,
  onClearView,
}: {
  view: (AskView & { label: string }) | null;
  onClearView: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  const ask = async (rawQuestion: string) => {
    const parsedQuestion = askQuestionSchema.safeParse({ question: rawQuestion });
    if (!parsedQuestion.success) {
      setResult(null);
      setError(parsedQuestion.error.issues[0]?.message ?? "Enter a question");
      setOpen(true);
      return;
    }

    setOpen(true);
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsedQuestion.data,
          view: view
            ? {
                scope: view.scope,
                collectionKey: view.collectionKey,
                recordId: view.recordId,
              }
            : undefined,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = askErrorSchema.safeParse(payload);
        setError(parsedError.success ? parsedError.data.error : "Ask failed");
        return;
      }
      const parsed = askResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("Ask failed");
        return;
      }
      setResult(parsed.data);
    } catch {
      setError("Ask failed");
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  const close = () => setOpen(false);
  const revealed = open && !pending && (result !== null || error !== null);
  const citations: AskCitation[] = result?.citations.slice(0, 4) ?? [];
  const surfaceClass = [
    "bccns-siri",
    focused ? "is-focused" : "",
    pending ? "is-pending" : "",
    revealed ? "is-open" : "",
  ]
    .filter((name) => name.length > 0)
    .join(" ");

  return (
    <div className="bccns-header-search">
      {open && (
        <button type="button" className="bccns-siri-backdrop" aria-label="Close" onClick={close} />
      )}
      <div className={surfaceClass} role={revealed ? "dialog" : undefined} aria-label="Archive answer">
        <span className="bccns-siri-rim" aria-hidden="true" />
        <form onSubmit={onSubmit}>
          <svg className="bccns-siri-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M15.2 15.2 L20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            id="archiveSearch"
            type="search"
            placeholder={
              view?.scope === "record"
                ? "Ask about this record"
                : view?.scope === "room"
                  ? "Ask about this room"
                  : "Ask the archive"
            }
            aria-label="Ask the archive"
            aria-describedby={view ? "archiveAskView" : undefined}
            aria-expanded={revealed}
            autoComplete="off"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
            }}
          />
          {view && (
            <span className="bccns-siri-view" id="archiveAskView" title={view.label}>
              <span key={`${view.scope}:${view.label}`} className="bccns-siri-view-label">
                {view.label}
              </span>
              <button type="button" aria-label="Ask about the whole archive" onClick={onClearView}>
                ×
              </button>
            </span>
          )}
          <span className="bccns-siri-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </form>
        <div className="bccns-siri-body">
          <div className="bccns-siri-body-inner">
            {error && <p className="bccns-siri-answer">{error}</p>}
            {result && (
              <>
                <p className="bccns-siri-answer">{shortAskAnswer(result.summary)}</p>
                {citations.length > 0 && (
                  <ul className="bccns-siri-sources">
                    {citations.map((citation) => (
                      <li key={citation.id}>
                        <Link href={citationHref(citation)}>{citation.title}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
