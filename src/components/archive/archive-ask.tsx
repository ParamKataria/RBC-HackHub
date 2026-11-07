"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

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
 * SOURCE OF TRUTH KEYWORDS: citationHref, AskCitation, catalog link
 * WHAT: Builds the link for a cited record, preferring the in-archive deep link.
 * WHY: Catalog ids and collection records do not share one URL shape.
 * WHERE: ArchiveAsk answer sources.
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

export interface ArchiveGlance {
  id: string;
  kicker: string;
  title: string;
  body: string;
}

interface ThreadAnswer {
  id: string;
  result: AskResponse | null;
  error: string | null;
  pending: boolean;
}

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveAsk, settled glance, spring expand, search stays on top
 * WHAT: Header question field that drops open with a short note once a door or record has settled.
 * WHY: The note replaces the context chip. The input stays the first row so a question can still be asked about what is in view.
 * WHERE: BccnsArchiveExperience top bar.
 */
export function ArchiveAsk({
  view,
  glance,
  placement = "header",
}: {
  view: AskView | null;
  glance: ArchiveGlance | null;
  placement?: "header" | "view";
}) {
  const [question, setQuestion] = useState("");
  const [focused, setFocused] = useState(false);
  const [clearingQuestion, setClearingQuestion] = useState(false);
  const submittedQuestionRef = useRef(false);
  const [answers, setAnswers] = useState<ThreadAnswer[]>([]);
  const [closing, setClosing] = useState(false);
  const closingTargetRef = useRef<{ clearAnswers: boolean; glanceId: string | null } | null>(null);

  const ask = async (rawQuestion: string) => {
    const parsedQuestion = askQuestionSchema.safeParse({ question: rawQuestion });
    const id = crypto.randomUUID();
    if (!parsedQuestion.success) {
      setAnswers((prev) => [
        ...prev,
        {
          id,
          result: null,
          error: parsedQuestion.error.issues[0]?.message ?? "Enter a question",
          pending: false,
        },
      ]);
      return;
    }

    setAnswers((prev) => [...prev, { id, result: null, error: null, pending: true }]);
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
        const message = parsedError.success ? parsedError.data.error : "Ask failed";
        setAnswers((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, pending: false, error: message } : item,
          ),
        );
        return;
      }
      const parsed = askResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setAnswers((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, pending: false, error: "Ask failed" } : item,
          ),
        );
        return;
      }
      setAnswers((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, pending: false, result: parsed.data } : item,
        ),
      );
    } catch {
      setAnswers((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, pending: false, error: "Ask failed" } : item,
        ),
      );
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const asked = question;
    if (!askQuestionSchema.safeParse({ question: asked }).success) {
      void ask(asked);
      return;
    }
    submittedQuestionRef.current = true;
    void ask(asked);
  };

  const [heldGlance, setHeldGlance] = useState(glance);
  const [glanceOpen, setGlanceOpen] = useState(false);

  useEffect(() => {
    if (!glance) {
      setGlanceOpen(false);
      return;
    }
    setHeldGlance(glance);
    setGlanceOpen(false);
  }, [glance]);

  useEffect(() => {
    if (glance || glanceOpen || !heldGlance) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setHeldGlance(null), reduceMotion ? 0 : 760);
    return () => window.clearTimeout(timer);
  }, [glance, glanceOpen, heldGlance]);

  const pending = answers.some((item) => item.pending);
  const shownAnswer = [...answers].reverse().find((item) => !item.pending && (item.result || item.error)) ?? null;

  const openDetails = () => {
    if (!glance) return;
    setHeldGlance(glance);
    setGlanceOpen(true);
  };

  const clearCurrent = () => {
    if (closing) return;
    if (shownAnswer && glance) {
      setAnswers([]);
      setHeldGlance(glance);
      setGlanceOpen(true);
      return;
    }
    closingTargetRef.current = { clearAnswers: shownAnswer !== null, glanceId: null };
    setGlanceOpen(false);
    setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    const target = closingTargetRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      if (target?.clearAnswers) setAnswers([]);
      setClosing(false);
    }, reduceMotion ? 0 : 760);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const revealed = shownAnswer !== null;
  const showGlance = Boolean(heldGlance);
  const expanded = !closing && (glanceOpen || revealed);
  const infoWanted = Boolean(glance) && !expanded;
  const [infoMounted, setInfoMounted] = useState(false);
  const [infoShown, setInfoShown] = useState(false);
  const [textShown, setTextShown] = useState(false);

  /**
   * SOURCE OF TRUTH KEYWORDS: info fade, text fade, ArchiveAsk, glance indicator
   * WHAT: Fades the info mark in and out, and fades the note only after the sheet has opened.
   * WHY: Unmounting the mark skips the fade, and fading the note while the sheet height is still zero makes the words pop in.
   * WHERE: ArchiveAsk header search.
   */
  useEffect(() => {
    if (!infoWanted) {
      setInfoShown(false);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timer = window.setTimeout(() => setInfoMounted(false), reduceMotion ? 0 : 460);
      return () => window.clearTimeout(timer);
    }
    setInfoMounted(true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setInfoShown(true);
      return;
    }
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setInfoShown(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [infoWanted]);

  useEffect(() => {
    if (!expanded) {
      setTextShown(false);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setTextShown(true), reduceMotion ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [expanded]);
  const citations: AskCitation[] = shownAnswer?.result?.citations.slice(0, 4) ?? [];
  const surfaceClass = [
    "bccns-siri",
    focused ? "is-focused" : "",
    pending ? "is-pending" : "",
    expanded ? "is-expanded" : "",
    textShown ? "is-text" : "",
    revealed ? "is-open" : "",
  ]
    .filter((name) => name.length > 0)
    .join(" ");

  return (
    <div className={placement === "view" ? "bccns-header-search bccns-ask-view-search" : "bccns-header-search"}>
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
            aria-expanded={expanded}
            autoComplete="off"
            className={clearingQuestion ? "is-clearing" : undefined}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onFocus={() => {
              setFocused(true);
              if (glance && !revealed && !glanceOpen) openDetails();
              if (!submittedQuestionRef.current || !question || clearingQuestion) return;
              const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              if (reduceMotion) {
                submittedQuestionRef.current = false;
                setQuestion("");
                return;
              }
              setClearingQuestion(true);
            }}
            onTransitionEnd={(event) => {
              if (event.propertyName !== "opacity" || !clearingQuestion) return;
              submittedQuestionRef.current = false;
              setQuestion("");
              setClearingQuestion(false);
            }}
            onBlur={() => setFocused(false)}
          />
          {(infoMounted || expanded) && (
            <span className="bccns-siri-trail">
              {infoMounted && (
                <button
                  type="button"
                  className={`bccns-siri-info${infoShown ? " is-shown" : ""}`}
                  aria-label="Show details"
                  aria-hidden={!infoShown}
                  tabIndex={infoShown ? 0 : -1}
                  onClick={openDetails}
                >
                  i
                </button>
              )}
              {expanded && (
                <button
                  type="button"
                  className="bccns-siri-dismiss-btn"
                  aria-label="Close details"
                  onClick={clearCurrent}
                >
                  ×
                </button>
              )}
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
            <div className="bccns-siri-swap">
              {showGlance && heldGlance && (
                <div
                  key={heldGlance.id}
                  className={`bccns-siri-glance ${revealed ? "is-out" : ""}`}
                  aria-hidden={revealed}
                >
                  <h2 className="bccns-siri-glance-title">
                    {heldGlance.title}
                    <span className="bccns-siri-kicker">{heldGlance.kicker}</span>
                  </h2>
                  <p className="bccns-siri-glance-body">{heldGlance.body}</p>
                </div>
              )}
              {shownAnswer && (
                <div key={shownAnswer.id} className="bccns-siri-answer-block">
                  {shownAnswer.error && <p className="bccns-siri-answer">{shownAnswer.error}</p>}
                  {shownAnswer.result && (
                    <>
                      <p className="bccns-siri-answer">{shortAskAnswer(shownAnswer.result.summary)}</p>
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
