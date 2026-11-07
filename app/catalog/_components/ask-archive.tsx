"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import styles from "@/app/catalog/_components/ask-archive.module.css";
import { ArchiveAnswer, requestArchiveAnswer } from "@/src/components/archive/archive-answer";
import { askResponseSchema, type AskResponse, type SearchQuery } from "@/src/types";

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
 * SOURCE OF TRUTH KEYWORDS: AskArchive, /api/ask, ArchiveAnswer, catalog
 * WHAT: The catalog ask bar. It uses the shared answer and then opens the matching records.
 * WHY: The citation treatment lives in ArchiveAnswer. This surface only adds the catalog filter.
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
    setPending(true);
    setError(null);
    try {
      const answer = await requestArchiveAnswer(rawQuestion);
      window.sessionStorage.setItem(STORED_ANSWER_KEY, JSON.stringify(answer));
      setResult(answer);
      router.push(filterHref(answer.filters));
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Ask failed");
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
      <form className={`${styles.form}${pending ? ` ${styles.pending}` : ""}`} onSubmit={onSubmit}>
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
        {open && !pending ? (
          <button type="button" className={styles.dismiss} aria-label="Close answer" onClick={clearAnswer}>
            Close
          </button>
        ) : null}
        <span className={styles.wave} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </form>
      {open ? (
        <div className={styles.panel}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {result ? <ArchiveAnswer result={result} /> : null}
        </div>
      ) : null}
    </div>
  );
}
