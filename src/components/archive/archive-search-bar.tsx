"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ArchiveAnswer, requestArchiveAnswer } from "@/src/components/archive/archive-answer";
import styles from "@/src/components/archive/archive-search-bar.module.css";
import {
  type ArchiveSearchBarProps,
  type AskResponse,
  type SearchQuery,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: filterHref, SearchQuery, /catalog, /api/ask, URLSearchParams
 * WHAT: Converts structured search filters into a URL query string for the catalog.
 * WHY: Ensures that plain-language inquiries link directly to the retrieved records.
 * WHERE: ArchiveSearchBar when resolving an answer or rendering the Catalog CTA link.
 */
export function filterHref(filters: SearchQuery): string {
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
 * SOURCE OF TRUTH KEYWORDS: ArchiveSearchBar, ArchiveSearchBarProps, shared search bar, AI inquiry, filterHref
 * WHAT: Global reusable search bar for Ask the Archive across Catalog and Home page views.
 * WHY: Unifies natural-language inquiries, loading animations, and grounded citation panels without storage leakage.
 * WHERE: Rendered on the /catalog route and the Home page arrival gate screen.
 */
export function ArchiveSearchBar({
  autoNavigate = false,
  showCatalogCta = false,
  placeholder = "Ask the archive",
  claimLimit,
  className,
  onAnswer,
  onClear,
}: ArchiveSearchBarProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  /**
   * SOURCE OF TRUTH KEYWORDS: askArchiveInquiry, requestArchiveAnswer, askResult, autoNavigate, filterHref
   * WHAT: Executes the plain-language archive inquiry against the backend service.
   * WHY: Fetches grounded summaries and updates isolated React state and optional URL navigation.
   * WHERE: Triggered by user form submission inside ArchiveSearchBar.
   */
  const ask = async (rawQuestion: string) => {
    setPending(true);
    setError(null);
    try {
      const answer = await requestArchiveAnswer(rawQuestion);
      setResult(answer);
      onAnswer?.(answer);
      if (autoNavigate) {
        router.push(filterHref(answer.filters));
      }
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Ask failed");
    } finally {
      setPending(false);
    }
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: onSubmitAskForm, FormEvent, rawQuestion, ArchiveSearchBar
   * WHAT: Handles form submission event and initiates the archive inquiry.
   * WHY: Prevents browser page reload and triggers asynchronous question evaluation.
   * WHERE: ArchiveSearchBar form onSubmit listener.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: clearArchiveAnswer, resetInquiry, dismissPanel, onClear, isolatedState
   * WHAT: Clears the current inquiry result, error state, and input question in local component state.
   * WHY: Allows visitors to collapse the citation panel and begin a fresh inquiry without touching browser storage.
   * WHERE: ArchiveSearchBar dismiss button and external onClear invocation.
   */
  const clearAnswer = () => {
    setResult(null);
    setError(null);
    setQuestion("");
    onClear?.();
  };

  const open = result !== null || error !== null;
  const containerClass = className ? `${styles.ask} ${className}` : styles.ask;

  return (
    <div className={containerClass} role={open ? "region" : undefined} aria-label="Archive answer">
      <form className={`${styles.form}${pending ? ` ${styles.pending}` : ""}`} onSubmit={onSubmit}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M15.2 15.2 L20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <input
          className={styles.input}
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
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
          {result ? (
            <>
              <ArchiveAnswer result={result} claimLimit={claimLimit} />
              {showCatalogCta ? (
                <div className={styles.ctaRow}>
                  <Link href={filterHref(result.filters)} className={styles.ctaButton}>
                    Explore matching records in Catalog &rarr;
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
