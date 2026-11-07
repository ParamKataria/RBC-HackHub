"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiFilter } from "react-icons/fi";

import { ArchiveAnswer, requestArchiveAnswer } from "@/src/components/archive/archive-answer";
import styles from "@/src/components/archive/archive-search-bar.module.css";
import {
  type ArchiveSearchBarProps,
  type AskResponse,
  type SearchMode,
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
 * SOURCE OF TRUTH KEYWORDS: defaultKeywordPlaceholder, defaultAiPlaceholder, searchPlaceholders, searchModeDefaults, dualModeSearch
 * WHAT: Standard placeholder strings for keyword catalog search and plain-language AI archival inquiries.
 * WHY: Guides visitors on appropriate query phrasing according to active search mode per User Stories 7 and 8.
 * WHERE: ArchiveSearchBar input placeholder resolution.
 */
const defaultKeywordPlaceholder =
  "Search title, description, subject, place, or community...";
const defaultAiPlaceholder = "Ask a question in plain language...";

/**
 * SOURCE OF TRUTH KEYWORDS: handleRadioArrowNavigation, accessibleRadioGroup, arrowKeyNavigation, rovingTabindexFocus, waiAriaRadio
 * WHAT: Determines target search mode and triggers imperative button focus when arrow keys navigate within the mode radio group.
 * WHY: Adheres to WAI-ARIA radio group keyboard pattern by shifting active selection and DOM focus on Arrow keys.
 * WHERE: ArchiveSearchBar radio button onKeyDown handlers and accessibility unit tests.
 */
export function handleRadioArrowNavigation(
  key: string,
  callbacks: {
    switchMode: (mode: SearchMode) => void;
    focusKeyword: () => void;
    focusAi: () => void;
  },
): boolean {
  if (key === "ArrowLeft" || key === "ArrowUp") {
    callbacks.switchMode("keyword");
    callbacks.focusKeyword();
    return true;
  }
  if (key === "ArrowRight" || key === "ArrowDown") {
    callbacks.switchMode("ai");
    callbacks.focusAi();
    return true;
  }
  return false;
}

/**
 * SOURCE OF TRUTH KEYWORDS: handleModeSwitch, SearchMode, dualModeSearch, modeToggle, filterPanelCollapse, aiModeSuppression
 * WHAT: Determines search mode transitions, dismissing AI results when switching to keyword mode and auto-collapsing open filter panels when switching to AI mode.
 * WHY: Provides a deterministic, testable seam that ensures Ticket 02 mode-switching contracts are maintained without UI side-effects.
 * WHERE: ArchiveSearchBar switchMode callback and ask-search-verification tests.
 */
export function handleModeSwitch(
  currentMode: SearchMode,
  newMode: SearchMode,
  options: {
    filterPanelOpen?: boolean;
    onToggleFilterPanel?: () => void;
    clearAiResults?: () => void;
  },
): boolean {
  if (newMode === currentMode) {
    return false;
  }
  if (newMode === "keyword") {
    options.clearAiResults?.();
  } else if (newMode === "ai") {
    if (options.filterPanelOpen) {
      options.onToggleFilterPanel?.();
    }
  }
  return true;
}

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveSearchBar, ArchiveSearchBarProps, enableFilterPill, filterPanelOpen, activeFilterCount, dualModeSearch
 * WHAT: Global reusable search bar supporting dual-mode database keyword search, integrated filter pill, and natural-language AI archival inquiries.
 * WHY: Unifies keyword catalog exploration and AI claim synthesis with query retention, URL synchronization, and accessible mode and filter toggles.
 * WHERE: Rendered on the /catalog route and the Home page arrival gate screen.
 */
export function ArchiveSearchBar({
  autoNavigate = false,
  showCatalogCta = false,
  initialQuestion,
  placeholder,
  claimLimit,
  className,
  enableModeToggle = false,
  defaultMode,
  currentFilters,
  enableFilterPill = false,
  filterPanelOpen = false,
  activeFilterCount,
  onToggleFilterPanel,
  onAnswer,
  onClear,
}: ArchiveSearchBarProps) {
  const router = useRouter();
  const initialEffectiveMode: SearchMode =
    defaultMode ?? (enableModeToggle ? "keyword" : "ai");
  const [mode, setMode] = useState<SearchMode>(initialEffectiveMode);
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  const keywordRadioRef = useRef<HTMLButtonElement | null>(null);
  const aiRadioRef = useRef<HTMLButtonElement | null>(null);

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
   * SOURCE OF TRUTH KEYWORDS: switchMode, dualModeSearch, modeToggle, queryRetention, panelDismissal
   * WHAT: Switches active search mode between database keyword search and AI archival inquiries.
   * WHY: Preserves drafted query text in memory while dismissing open AI answer panels when returning to keyword mode.
   * WHERE: ArchiveSearchBar mode toggle click and CTA prompt activation.
   */
  const switchMode = (newMode: SearchMode) => {
    const switched = handleModeSwitch(mode, newMode, {
      filterPanelOpen,
      onToggleFilterPanel,
      clearAiResults: () => {
        setResult(null);
        setError(null);
      },
    });
    if (switched) {
      setMode(newMode);
    }
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: handleRadioKeyDown, accessibleRadioGroup, arrowKeyNavigation, modeToggleKeyNav, searchAccessibility, rovingTabindexFocus
   * WHAT: Handles keyboard arrow navigation for the accessible mode toggle radiogroup.
   * WHY: Satisfies WAI-ARIA radio group keyboard pattern by navigating between Keyword and AI modes and imperatively shifting DOM focus.
   * WHERE: Mode toggle radio button onKeyDown handlers in ArchiveSearchBar.
   */
  const handleRadioKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const handled = handleRadioArrowNavigation(event.key, {
      switchMode,
      focusKeyword: () => keywordRadioRef.current?.focus(),
      focusAi: () => aiRadioRef.current?.focus(),
    });
    if (handled) {
      event.preventDefault();
    }
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: askArchiveInquiry, requestArchiveAnswer, askResult, autoNavigate, filterHref
   * WHAT: Executes the plain-language archive inquiry against the backend service.
   * WHY: Fetches grounded summaries and updates isolated React state and optional URL navigation.
   * WHERE: Triggered by user form submission inside ArchiveSearchBar in AI mode.
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
   * WHAT: Handles form submission event for either keyword navigation or AI inquiry evaluation.
   * WHY: In keyword mode navigates to /catalog preserving secondary filters; in AI mode dispatches grounded inquiry request.
   * WHERE: ArchiveSearchBar form onSubmit listener and submit button click/touch trigger.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (enableModeToggle && mode === "keyword") {
      const trimmed = question.trim();
      const currentSearch =
        typeof window !== "undefined" ? window.location.search : "";
      const targetUrl = mergeCatalogSearchParams(currentSearch, {
        ...(currentFilters ?? {}),
        q: trimmed,
      });
      router.push(targetUrl);
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
  const isKeyword = mode === "keyword";
  const activePlaceholder =
    placeholder &&
    placeholder !== defaultKeywordPlaceholder &&
    placeholder !== defaultAiPlaceholder
      ? placeholder
      : isKeyword
        ? defaultKeywordPlaceholder
        : defaultAiPlaceholder;

  const rootClass = className
    ? `${styles.container} ${className}`
    : styles.container;

  const searchInputBlock = (
    <div
      className={styles.ask}
      role={open ? "region" : undefined}
      aria-label={open ? "Archive answer" : undefined}
    >
      <form
        className={`${styles.form}${pending ? ` ${styles.pending}` : ""}`}
        onSubmit={onSubmit}
      >
        <button
          type="submit"
          className={styles.submitButton}
          aria-label={
            enableModeToggle && isKeyword
              ? "Search catalog"
              : "Submit inquiry"
          }
          disabled={pending}
        >
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M15.2 15.2 L20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <input
          className={styles.input}
          type="search"
          placeholder={activePlaceholder}
          aria-label={activePlaceholder}
          autoComplete="off"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        {open && !pending ? (
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Close answer"
            onClick={clearAnswer}
          >
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
                  <Link
                    href={filterHref(result.filters)}
                    className={styles.ctaButton}
                  >
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

  return (
    <div className={rootClass}>
      {enableModeToggle && (
        <div
          className={styles.modeToggle}
          role="radiogroup"
          aria-label="Search mode"
        >
          <button
            ref={keywordRadioRef}
            type="button"
            role="radio"
            aria-checked={isKeyword}
            tabIndex={isKeyword ? 0 : -1}
            className={`${styles.modeButton}${isKeyword ? ` ${styles.activeMode}` : ""}`}
            onClick={() => switchMode("keyword")}
            onKeyDown={handleRadioKeyDown}
          >
            Keyword Search
          </button>
          <button
            ref={aiRadioRef}
            type="button"
            role="radio"
            aria-checked={!isKeyword}
            tabIndex={!isKeyword ? 0 : -1}
            className={`${styles.modeButton}${!isKeyword ? ` ${styles.activeMode}` : ""}`}
            onClick={() => switchMode("ai")}
            onKeyDown={handleRadioKeyDown}
          >
            Ask AI
          </button>
        </div>
      )}

      {enableFilterPill && isKeyword ? (
        <div className={styles.searchRow}>
          {searchInputBlock}
          <button
            type="button"
            className={styles.filterPill}
            aria-expanded={filterPanelOpen ?? false}
            aria-controls="catalog-filters-panel"
            aria-label={`Filters${activeFilterCount && activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
            onClick={onToggleFilterPanel}
          >
            <FiFilter className={styles.filterIcon} aria-hidden="true" />
            <span>Filters</span>
            {activeFilterCount && activeFilterCount > 0 ? (
              <span className={styles.filterBadge} data-testid="search-bar-filter-badge">
                ({activeFilterCount})
              </span>
            ) : null}
          </button>
        </div>
      ) : (
        searchInputBlock
      )}

      {enableModeToggle && isKeyword ? (
        <div className={styles.modeCta}>
          <button
            type="button"
            className={styles.ctaPrompt}
            onClick={() => switchMode("ai")}
          >
            Looking for answers in plain language?{" "}
            <span className={styles.ctaPromptHighlight}>Switch to Ask AI</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
