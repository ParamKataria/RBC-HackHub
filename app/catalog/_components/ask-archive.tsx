"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import styles from "@/app/catalog/_components/ask-archive.module.css";
import {
  askErrorSchema,
  askQuestionSchema,
  askResponseSchema,
  noArchiveSourceMessage,
  type AskResponse,
  type SearchQuery,
} from "@/src/types";

const RECORD_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const STORED_ANSWER_KEY = "bccns-catalog-ask";

/**
 * SOURCE OF TRUTH KEYWORDS: filterHref, SearchQuery, /catalog, /api/ask
 * WHAT: Builds the catalog URL for the filters the question was translated into.
 * WHY: Asking a question should open the same records the summary used.
 * WHERE: AskArchive, after a successful answer.
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
 * SOURCE OF TRUTH KEYWORDS: sameFilters, SearchQuery, catalog URL
 * WHAT: Checks that the current catalog query is the answer's filter set.
 * WHY: A stored answer should stay visible only while those records are on screen.
 * WHERE: AskArchive on load.
 */
function sameFilters(filters: SearchQuery): boolean {
  const expected = new URLSearchParams(filterHref(filters).split("?")[1] ?? "");
  const current = new URLSearchParams(window.location.search);
  current.delete("page");
  const keys = new Set([...expected.keys(), ...current.keys()]);
  for (const key of keys) {
    if ((expected.get(key) ?? "") !== (current.get(key) ?? "")) return false;
  }
  return true;
}

/**
 * SOURCE OF TRUTH KEYWORDS: shortCatalogAnswer, Sources, record id, summary
 * WHAT: Keeps the match count and the first two sentences, without the source dump.
 * WHY: The catalog bar should read like the archive bar, and the records sit in the list below.
 * WHERE: CitedSummary.
 */
function shortCatalogAnswer(summary: string): string {
  const withoutSources = summary.split(/\n\nSources:/)[0] ?? summary;
  const paragraphs = withoutSources
    .split(/\n\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
  const lead = paragraphs[0]?.startsWith("The search matched") ? paragraphs[0] : "";
  const claims = (lead ? paragraphs.slice(1) : paragraphs).slice(0, 2);
  return [lead, ...claims].filter((paragraph) => paragraph.length > 0).join("\n\n");
}

/**
 * SOURCE OF TRUTH KEYWORDS: CitedSummary, record id, citation, /catalog/[id]
 * WHAT: Renders the short summary and links each cited record id to its catalog page.
 * WHY: A record id in the answer is only a link when that id was returned as a citation.
 * WHERE: AskArchive result.
 */
function CitedSummary({ result }: { result: AskResponse }) {
  const titles = new Map(result.citations.map((citation) => [citation.id.toLowerCase(), citation]));
  const paragraphs = shortCatalogAnswer(result.summary).split(/\n\n/);

  return (
    <div className={styles.answer}>
      {paragraphs.map((paragraph) => {
        const parts = paragraph.split(RECORD_ID_PATTERN);
        const ids = paragraph.match(RECORD_ID_PATTERN) ?? [];
        return (
          <p key={paragraph.slice(0, 24)}>
            {parts.map((part, index) => {
              const citation = titles.get(ids[index]?.toLowerCase() ?? "");
              return (
                <span key={`${index}-${part.slice(0, 12)}`}>
                  {part}
                  {citation ? <Link href={`/catalog/${citation.id}`}>{citation.title}</Link> : null}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: AskArchive, /api/ask, citation, question, catalog
 * WHAT: The archive ask bar on the catalog, using the same search the records below read.
 * WHY: A question should filter this page and cite only the records that search returns.
 * WHERE: Catalog index, above the structured filters.
 */
export function AskArchive() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORED_ANSWER_KEY);
    if (!stored) return;
    try {
      const parsed = askResponseSchema.safeParse(JSON.parse(stored));
      if (!parsed.success || !sameFilters(parsed.data.filters)) return;
      setResult(parsed.data);
      setQuestion(parsed.data.question);
    } catch {
      window.sessionStorage.removeItem(STORED_ANSWER_KEY);
    }
  }, []);

  const ask = async (rawQuestion: string) => {
    const parsedQuestion = askQuestionSchema.safeParse({ question: rawQuestion });
    if (!parsedQuestion.success) {
      setResult(null);
      setError(parsedQuestion.error.issues[0]?.message ?? "Enter a question");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedQuestion.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = askErrorSchema.safeParse(payload);
        setResult(null);
        setError(parsedError.success ? parsedError.data.error : "Ask failed");
        return;
      }
      const parsed = askResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setResult(null);
        setError("Ask failed");
        return;
      }
      window.sessionStorage.setItem(STORED_ANSWER_KEY, JSON.stringify(parsed.data));
      setResult(parsed.data);
      router.push(filterHref(parsed.data.filters));
    } catch {
      setResult(null);
      setError("Ask failed");
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  const clearAnswer = () => {
    window.sessionStorage.removeItem(STORED_ANSWER_KEY);
    setResult(null);
    setError(null);
    setQuestion("");
  };

  const open = result !== null || error !== null;

  return (
    <div className={styles.ask} role={open ? "region" : undefined} aria-label="Archive answer">
      <form className={styles.form} onSubmit={onSubmit}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M15.2 15.2 L20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <input
          className={styles.input}
          type="search"
          placeholder="Ask the archive"
          aria-label="Ask the archive"
          autoComplete="off"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        {pending ? <span className={styles.status}>Searching</span> : null}
        {open ? (
          <button type="button" className={styles.dismiss} aria-label="Close answer" onClick={clearAnswer}>
            Close
          </button>
        ) : null}
      </form>
      {open ? (
        <div className={styles.panel}>
          {error ? (
            <div className={styles.answer}>
              <p>{error}</p>
            </div>
          ) : null}
          {result ? (
            <>
              <CitedSummary result={result} />
              {result.summary === noArchiveSourceMessage || result.citations.length === 0 ? null : (
                <ul className={styles.sources}>
                  {result.citations.slice(0, 4).map((citation) => (
                    <li key={citation.id}>
                      <Link href={`/catalog/${citation.id}`}>{citation.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
