import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCcw01 } from "@untitledui/icons";

// Cycling status messages shown while the AI is processing.
// Each step advances every PENDING_INTERVAL_MS until the last one,
// which stays put until the answer returns.
const PENDING_MESSAGES = [
  "Searching the research base...",
  "Retrieving relevant data points...",
  "Weighing the evidence...",
  "Composing your answer...",
];
const PENDING_INTERVAL_MS = 2500;
import { Button } from "@/components/base/buttons/button";
import { TextAreaBase } from "@/components/base/textarea/textarea";
import { EXAMPLE_PROMPTS } from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";
import { renderAnswerBlocks, USER_TURN_LIMIT } from "@/lib/workspace-utils";

export default function AskPage() {
  const {
    turns,
    input,
    setInput,
    pending,
    error,
    handleAskQuestion,
    resetConversation,
    reachedTurnLimit,
    userTurnsCount,
    activeAnswer,
    highlightedEvidenceId,
    focusAnswerEvidence,
  } = useWorkspace();

  const bottomRef = useRef<HTMLDivElement>(null);
  const suggestions = EXAMPLE_PROMPTS;
  const questionsRemaining = Math.max(USER_TURN_LIMIT - userTurnsCount, 0);
  const nextQuestionNumber = Math.min(userTurnsCount + 1, USER_TURN_LIMIT);
  const threadComplete = reachedTurnLimit && !pending;

  // Cycle the pending status message while the query is in flight.
  const [pendingIdx, setPendingIdx] = useState(0);
  useEffect(() => {
    if (!pending) {
      setPendingIdx(0);
      return;
    }
    const id = setInterval(() => {
      setPendingIdx((i) => Math.min(i + 1, PENDING_MESSAGES.length - 1));
    }, PENDING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => {
    if (!activeAnswer || !highlightedEvidenceId) return;
    const selector = `[data-dp-id="${CSS.escape(highlightedEvidenceId)}"]`;
    const activeAnswerEl = document.querySelector('[data-active-answer="true"]');
    const el = activeAnswerEl?.querySelector(selector) ?? document.querySelector(selector);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeAnswer, highlightedEvidenceId]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col px-6 py-8">
      {turns.length === 0 ? (
        /* Initial state — suggestions only. The header already names the
           page (nav + breadcrumb), and the prompts themselves explain the
           feature better than a hero block could. */
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Suggested prompts
          </p>
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void handleAskQuestion(prompt)}
              className="group w-full rounded-xl border border-secondary bg-primary px-4 py-3 text-left text-sm leading-6 text-secondary transition hover:border-brand hover:bg-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <span>{prompt}</span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-quaternary transition group-hover:translate-x-0.5 group-hover:text-brand-secondary" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Conversation */
        <div className="space-y-4">
          {turns.map((turn, idx) => (
            <div key={idx}>
              <div
                className={cn(
                  "rounded-xl border px-4 py-3",
                  turn.role === "user"
                    ? "border-brand bg-brand-primary"
                    : "border-secondary bg-primary",
                )}
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                  {turn.role === "user" ? "You" : "Research assistant"}
                </p>
                {turn.role === "assistant" ? (
                  <div
                    className="mt-2 space-y-3 text-sm leading-7 text-secondary"
                    data-active-answer={activeAnswer === turn.answerState ? "true" : undefined}
                  >
                    {renderAnswerBlocks(
                      turn.content,
                      new Map(
                        turn.answerState.citations.map((c) => [c.label, c.dataPointId]),
                      ),
                      (dpId) => focusAnswerEvidence(turn.answerState, dpId),
                      {
                        highlightedDpId:
                          activeAnswer === turn.answerState ? highlightedEvidenceId : null,
                      },
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-7 text-secondary">{turn.content}</p>
                )}
              </div>

              {/* Evidence renders in the right-side EvidencePanel (AppShell) */}
            </div>
          ))}

          {pending && (
            <div className="rounded-xl border border-brand bg-brand-primary px-4 py-3 text-sm text-brand-secondary">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 animate-pulse rounded-full bg-brand-solid"
                />
                {PENDING_MESSAGES[pendingIdx]}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-error bg-error-primary px-4 py-3 text-sm text-error-primary">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area — sticky at bottom */}
      <div className="sticky bottom-0 mt-6 border-t border-secondary bg-secondary pt-4 pb-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              {reachedTurnLimit
                ? pending
                  ? "Final question in progress"
                  : "Thread complete"
                : `Question ${nextQuestionNumber} of ${USER_TURN_LIMIT}`}
            </p>
            <p className="mt-1 text-xs text-tertiary">
              {reachedTurnLimit
                ? pending
                  ? "Composing the last answer in this thread."
                  : "Start a new thread to ask another question."
                : `${questionsRemaining} question${questionsRemaining === 1 ? "" : "s"} left in this thread.`}
            </p>
          </div>
          {threadComplete && (
            <Button
              size="sm"
              color="primary"
              iconLeading={RefreshCcw01}
              onClick={resetConversation}
            >
              Start a new thread
            </Button>
          )}
        </div>
        {!reachedTurnLimit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAskQuestion();
            }}
            // Shared-element target for the View Transitions morph from
            // the home page's hero input. Must match HeroAskInput's form
            // view-transition-name.
            style={{ viewTransitionName: "curate-ask-input" }}
          >
            <TextAreaBase
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleAskQuestion();
                }
              }}
              rows={3}
              disabled={pending}
              placeholder="Ask about AI strategy, adoption, agentic workflows..."
              className="min-h-[4.5rem] resize-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-tertiary">{"\u2318"}/Ctrl + Enter</p>
              <Button
                type="submit"
                size="sm"
                color="primary"
                iconTrailing={ArrowRight}
                disabled={pending || !input.trim()}
              >
                {pending ? "Asking..." : "Ask"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
