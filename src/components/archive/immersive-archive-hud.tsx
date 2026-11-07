"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ArchiveAnswer, requestArchiveAnswer } from "@/src/components/archive/archive-answer";
import {
  askQuestionSchema,
  type AskResponse,
  type ImmersiveArchiveHUDProps,
} from "@/src/types";

interface ThreadAnswer {
  id: string;
  result: AskResponse | null;
  error: string | null;
  pending: boolean;
}

/**
 * SOURCE OF TRUTH KEYWORDS: ImmersiveArchiveHUD, settled glance, 3D rotunda search, room record scoping
 * WHAT: Ambient HUD controller and search bar floating in the 3D digital archive top navigation bar.
 * WHY: Enables visitors to inspect room/record glances and ask scoped questions with concise 2-claim summaries.
 * WHERE: Mounted in BccnsArchiveExperience top navigation bar.
 */
export function ImmersiveArchiveHUD({
  view = null,
  glance = null,
  placement = "header",
}: ImmersiveArchiveHUDProps) {
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
      const result = await requestArchiveAnswer(parsedQuestion.data.question, view);
      setAnswers((prev) =>
        prev.map((item) => (item.id === id ? { ...item, pending: false, result } : item)),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ask failed";
      setAnswers((prev) =>
        prev.map((item) => (item.id === id ? { ...item, pending: false, error: message } : item)),
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
    setHeldGlance((prev) => (prev?.id === glance.id ? prev : glance));
    setGlanceOpen(false);
  }, [glance]);

  useEffect(() => {
    if (glance || glanceOpen || !heldGlance) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setHeldGlance(null), reduceMotion ? 0 : 760);
    return () => window.clearTimeout(timer);
  }, [glance, glanceOpen, heldGlance]);

  const pending = answers.some((item) => item.pending);
  const shownAnswer =
    [...answers].reverse().find((item) => !item.pending && (item.result || item.error)) ?? null;

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

  const placeholder =
    view?.scope === "record"
      ? "Ask about this record"
      : view?.scope === "room"
        ? "Ask about this room"
        : "Ask the archive";

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
            placeholder={placeholder}
            aria-label={placeholder}
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
                  &times;
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
                    <div className="bccns-siri-answer">
                      <ArchiveAnswer result={shownAnswer.result} claimLimit={2} />
                    </div>
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
