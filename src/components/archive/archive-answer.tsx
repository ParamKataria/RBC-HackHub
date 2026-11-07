"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "@/src/components/archive/archive-answer.module.css";
import {
  askErrorSchema,
  askQuestionSchema,
  askResponseSchema,
  noArchiveSourceMessage,
  type AskCitation,
  type AskResponse,
  type AskView,
} from "@/src/types";

const BRACKETED_RECORD_ID =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/**
 * SOURCE OF TRUTH KEYWORDS: requestArchiveAnswer, /api/ask, AskView, AskResponse
 * WHAT: Sends one question to the shared archive ask endpoint.
 * WHY: The catalog and the room must ask the same search, including a room or record when one is in view.
 * WHERE: AskArchive and ArchiveAsk.
 */
export async function requestArchiveAnswer(question: string, view?: AskView | null): Promise<AskResponse> {
  const parsed = askQuestionSchema.safeParse({
    question,
    ...(view ? { view } : {}),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Enter a question");
  }
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsedError = askErrorSchema.safeParse(payload);
    throw new Error(parsedError.success ? parsedError.data.error : "Ask failed");
  }
  const parsedBody = askResponseSchema.safeParse(payload);
  if (!parsedBody.success) {
    throw new Error("Ask failed");
  }
  return parsedBody.data;
}

/**
 * SOURCE OF TRUTH KEYWORDS: citationHref, AskCitation, catalog link, collection
 * WHAT: Builds the link for a cited record.
 * WHY: Catalog ids and records that only exist in a room do not share one URL.
 * WHERE: ArchiveAnswer marks and the source list.
 */
function citationHref(citation: Pick<AskCitation, "id" | "collectionKey">): string {
  const isCatalogId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(citation.id);
  if (!isCatalogId && citation.collectionKey) {
    return `/?collection=${citation.collectionKey}&record=${citation.id}`;
  }
  return `/catalog/${citation.id}`;
}

/**
 * SOURCE OF TRUTH KEYWORDS: spokenClaims, Sources, in-text citation, summary
 * WHAT: Keeps the spoken paragraphs, including the record ids each sentence cites.
 * WHY: Both ask surfaces read the same grounded summary.
 * WHERE: ArchiveAnswer.
 */
function spokenClaims(summary: string): string[] {
  const withoutSources = summary.split(/\n\nSources:\n/)[0] ?? summary;
  const withoutLead = withoutSources.replace(/^The search matched[\s\S]*?\n\n/, "");
  return withoutLead
    .split(/\n\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * SOURCE OF TRUTH KEYWORDS: paragraphCitations, BRACKETED_RECORD_ID, AskCitation, title
 * WHAT: Splits one claim into its sentence and the records that sentence cites.
 * WHY: The sentence stays readable, and each record id becomes a numbered mark.
 * WHERE: ArchiveAnswer.
 */
function paragraphCitations(paragraph: string, known: ReadonlyMap<string, AskCitation>): { text: string; cites: AskCitation[] } {
  const parts = paragraph.split(BRACKETED_RECORD_ID);
  const text = parts
    .filter((_, index) => index % 2 === 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const cites: AskCitation[] = [];
  const seen = new Set<string>();
  parts.forEach((part, index) => {
    if (index % 2 === 0) return;
    const key = part.toLowerCase();
    const citation = known.get(key);
    if (!citation || seen.has(key)) return;
    seen.add(key);
    cites.push(citation);
  });
  return { text, cites };
}

/**
 * SOURCE OF TRUTH KEYWORDS: sourceIndex, citation number, AskCitation, accordion
 * WHAT: Numbers each cited record once, in the order the shown claims first use it.
 * WHY: An inline mark and the source list must share the same number.
 * WHERE: ArchiveAnswer.
 */
function sourceIndex(claims: readonly { cites: AskCitation[] }[], result: AskResponse): AskCitation[] {
  const seen = new Map<string, AskCitation>();
  for (const claim of claims) {
    for (const cite of claim.cites) {
      const key = cite.id.toLowerCase();
      if (!seen.has(key)) seen.set(key, cite);
    }
  }
  if (seen.size === 0 && result.summary !== noArchiveSourceMessage) {
    for (const citation of result.citations) {
      const key = citation.id.toLowerCase();
      if (!seen.has(key)) seen.set(key, citation);
    }
  }
  return [...seen.values()];
}

/**
 * SOURCE OF TRUTH KEYWORDS: sentenceParts, trailing punctuation, inline citation
 * WHAT: Separates a closing period from the sentence so a source mark can sit before it.
 * WHY: The mark belongs with the sentence it supports.
 * WHERE: ArchiveAnswer.
 */
function sentenceParts(text: string): { body: string; tail: string } {
  const match = text.match(/^(.*?)([.!?]+)$/);
  if (!match?.[1] || !match[2]) return { body: text, tail: "" };
  return { body: match[1], tail: match[2] };
}

/**
 * SOURCE OF TRUTH KEYWORDS: SourceTip, tooltip, citation title, minimal
 * WHAT: Shows the source title in a short label beside the numbered mark.
 * WHY: The mark stays a number, and the record name is available without opening the list.
 * WHERE: SourceMark, on hover and focus.
 */
function SourceTip({ anchor, title }: { anchor: HTMLElement; title: string }) {
  const box = anchor.getBoundingClientRect();
  const half = 110;
  const center = Math.min(window.innerWidth - 8 - half, Math.max(8 + half, box.left + box.width / 2));
  return createPortal(
    <span className={styles.tip} style={{ left: center, top: box.bottom + 8 }} role="tooltip">
      {title}
    </span>,
    document.body,
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: SourceMark, inline citation, tooltip, /catalog/[id]
 * WHAT: Renders one numbered source mark and its title tooltip.
 * WHY: The number in the sentence is the same number as the source list.
 * WHERE: InlineMarks.
 */
function SourceMark({ cite, number }: { cite: AskCitation; number: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Link
        href={citationHref(cite)}
        className={styles.mark}
        aria-label={`Source ${number}: ${cite.title}`}
        onMouseEnter={(event) => setAnchor(event.currentTarget)}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => setAnchor(event.currentTarget)}
        onBlur={() => setAnchor(null)}
      >
        {number}
      </Link>
      {anchor ? <SourceTip anchor={anchor} title={cite.title} /> : null}
    </>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: InlineMarks, collapsed citation, ellipsis, source number
 * WHAT: Shows the first source number, and folds any further numbers into one mark.
 * WHY: A sentence can cite many records without turning into a list of titles.
 * WHERE: ArchiveAnswer, at the end of a claim.
 */
function InlineMarks({ cites, numbers }: { cites: readonly AskCitation[]; numbers: ReadonlyMap<string, number> }) {
  const [open, setOpen] = useState(false);
  const shown = cites.length > 1 && !open ? cites.slice(0, 1) : cites;
  return (
    <span className={styles.marks}>
      {shown.map((cite) => {
        const number = numbers.get(cite.id.toLowerCase());
        return number ? <SourceMark key={cite.id} cite={cite} number={number} /> : null;
      })}
      {cites.length > 1 ? (
        <button
          type="button"
          className={styles.mark}
          aria-expanded={open}
          aria-label={
            open ? "Hide extra sources" : cites.length - 1 === 1 ? "1 more source" : `${cites.length - 1} more sources`
          }
          onClick={() => setOpen((current) => !current)}
        >
          …
        </button>
      ) : null}
    </span>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveAnswer, inline citation, sources accordion, tooltip
 * WHAT: Renders a grounded answer with numbered marks, a title tooltip, and a collapsed numbered source list.
 * WHY: The catalog and the room share one citation treatment. A surface passes claimLimit when it needs a shorter note.
 * WHERE: AskArchive and ArchiveAsk.
 */
export function ArchiveAnswer({ result, claimLimit }: { result: AskResponse; claimLimit?: number }): ReactNode {
  const known = new Map(result.citations.map((citation) => [citation.id.toLowerCase(), citation]));
  const claims = spokenClaims(result.summary)
    .map((paragraph) => paragraphCitations(paragraph, known))
    .slice(0, claimLimit);
  const sources = sourceIndex(claims, result);
  const numbers = new Map(sources.map((cite, index) => [cite.id.toLowerCase(), index + 1]));
  return (
    <div className={styles.answer}>
      {claims.map((claim, claimIndex) => {
        const sentence = sentenceParts(claim.text);
        return (
          <p className={styles.claim} key={`${claimIndex}-${claim.text.slice(0, 24)}`}>
            {sentence.body}
            {claim.cites.length > 0 ? <InlineMarks cites={claim.cites} numbers={numbers} /> : null}
            {sentence.tail}
          </p>
        );
      })}
      {sources.length > 0 ? (
        <details className={styles.sources}>
          <summary>
            <span className={styles.sourceToggle}>
              Sources
              <span>{sources.length}</span>
            </span>
          </summary>
          <ol>
            {sources.map((cite) => (
              <li key={cite.id} value={numbers.get(cite.id.toLowerCase())}>
                <Link href={citationHref(cite)}>{cite.title}</Link>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
