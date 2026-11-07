"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

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
 * SOURCE OF TRUTH KEYWORDS: mergeCatalogSearchParams, SearchQuery, URLSearchParams, secondaryFilters, preserveFilters
 * WHAT: Merges inquiry search filters with existing URL query parameters while removing pagination.
 * WHY: Preserves user-selected secondary facets (institution, place, type, etc.) during new inquiries.
 * WHERE: ArchiveSearchBar ask handler and catalog navigation tests.
 */
export function mergeCatalogSearchParams(
  currentSearch: string,
  filters: SearchQuery,
): string {
  const currentParams = new URLSearchParams(currentSearch);
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      currentParams.set(key, String(value));
    } else {
      currentParams.delete(key);
    }
  }
  currentParams.delete("page");
  const qs = currentParams.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: clearCatalogSearchParams, URLSearchParams, clearInquiry, resetFilters, secondaryFilters
 * WHAT: Clears the question and pagination query parameters from the URL while preserving secondary filters.
 * WHY: Returns visitors to secondary-only facet browsing when closing or dismissing an archive inquiry.
 * WHERE: ArchiveSearchBar clearAnswer handler and catalog navigation tests.
 */
export function clearCatalogSearchParams(currentSearch: string): string {
  const currentParams = new URLSearchParams(currentSearch);
  currentParams.delete("q");
  currentParams.delete("page");
  const qs = currentParams.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveSearchBar, ArchiveSearchBarProps, initialQuestion, shared search bar, AI inquiry, filterHref
 * WHAT: Global reusable search bar for Ask the Archive across Catalog and Home page views.
 * WHY: Unifies natural-language inquiries, loading animations, grounded citation panels, and URL query synchronization without storage leakage.
 * WHERE: Rendered on the /catalog route and the Home page arrival gate screen.
 */
export function ArchiveSearchBar({
  autoNavigate = false,
  showCatalogCta = false,
  initialQuestion,
  placeholder = "Ask the archive",
  claimLimit,
  className,
  onAnswer,
  onClear,
}: ArchiveSearchBarProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  /**
   * SOURCE OF TRUTH KEYWORDS: syncInitialQuestion, initialQuestion, ArchiveSearchBar, routeSync, emptyQuerySync
   * WHAT: Synchronizes the internal input question state whenever the initialQuestion prop changes.
   * WHY: Keeps the inquiry input aligned with external route transitions and resets to empty when cleared from URL params.
   * WHERE: ArchiveSearchBar local question state synchronization effect.
   */
  useEffect(() => {
    setQuestion(initialQuestion ?? "");
  }, [initialQuestion]);

  /**
   * SOURCE OF TRUTH KEYWORDS: askArchiveInquiry, requestArchiveAnswer, askResult, autoNavigate, filterHref
   * WHAT: Executes the plain-language archive inquiry against the backend service.
   * WHY: Fetches grounded summaries and updates isolated React state and optional URL navigation.
   * WHERE: Triggered by user form submission inside ArchiveSearchBar.
   */
  const ask = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const answer = await requestArchiveAnswer(trimmed);
      setResult(answer);
      onAnswer?.(answer);
      if (autoNavigate && typeof window !== "undefined") {
        const currentParams = new URLSearchParams(window.location.search);
        for (const [key, value] of Object.entries(answer.filters)) {
          if (value) currentParams.set(key, String(value));
          else currentParams.delete(key);
        }
        currentParams.delete("page");
        const qs = currentParams.toString();
        router.push(qs ? `/catalog?${qs}` : "/catalog");
      }
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Ask failed");
    } finally {
      setPending(false);
    }
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: onSubmitAskForm, FormEvent, rawQuestion, ArchiveSearchBar, submitButton
   * WHAT: Handles form submission event and initiates the archive inquiry.
   * WHY: Prevents browser page reload and duplicate in-flight requests while triggering asynchronous question evaluation.
   * WHERE: ArchiveSearchBar form onSubmit listener and submit button click/touch trigger.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
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
    if (autoNavigate && typeof window !== "undefined") {
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.delete("q");
      currentParams.delete("page");
      const qs = currentParams.toString();
      router.push(qs ? `/catalog?${qs}` : "/catalog");
    }
  };

  const open = result !== null || error !== null;
  const containerClass = className ? `${styles.ask} ${className}` : styles.ask;

  return (
    <div className={containerClass} role={open ? "region" : undefined} aria-label="Archive answer">
      <form className={`${styles.form}${pending ? ` ${styles.pending}` : ""}`} onSubmit={onSubmit}>
        <button
          type="submit"
          className={styles.submitButton}
          aria-label="Submit inquiry"
          disabled={pending}
        >
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M15.2 15.2 L20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
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
