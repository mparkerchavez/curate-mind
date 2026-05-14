import { useEffect, useRef, useState } from "react";
import { RefreshCcw01 } from "@untitledui/icons";

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
import { ExamplePromptChips } from "@/components/ExamplePromptChips";
import { HeroAskInput } from "@/components/HeroAskInput";
import { OpenSourceSection } from "@/components/OpenSourceSection";
import { SiteFooter } from "@/components/SiteFooter";
import { EXAMPLE_PROMPTS } from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useScrollHighlightedClaim } from "@/hooks/use-linked-evidence-scroll";
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
    highlightedEvidenceOrigin,
    highlightedEvidenceNonce,
    focusAnswerEvidence,
  } = useWorkspace();

  const bottomRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = EXAMPLE_PROMPTS;
  const questionsRemaining = Math.max(USER_TURN_LIMIT - userTurnsCount, 0);
  const threadComplete = reachedTurnLimit && !pending;
  const questionsUsed = Math.min(userTurnsCount, USER_TURN_LIMIT);
  const statusTitle =
    userTurnsCount === 0
      ? "Demo chat"
      : `Demo chat · ${questionsUsed} of ${USER_TURN_LIMIT} used`;
  const statusDescription = reachedTurnLimit
    ? pending
      ? "Composing the last answer in this thread."
      : "You've used the 3-question demo limit for this thread."
    : userTurnsCount === 0
      ? "Ask up to 3 questions in this demo thread."
      : `${questionsRemaining} question${questionsRemaining === 1 ? "" : "s"} remaining in this demo thread.`;

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

  useScrollHighlightedClaim({
    highlightedEvidenceId,
    enabled: !!activeAnswer && highlightedEvidenceOrigin !== "claim",
    triggerKey: highlightedEvidenceNonce,
    rootSelector: '[data-active-answer="true"]',
  });

  function handlePromptSelect(prompt: string) {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = askInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  return (
    <div className="flex min-h-full flex-col bg-primary">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
        {turns.length === 0 ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8 text-center">
            <HeroAskInput
              value={input}
              onChange={setInput}
              onSubmit={() => void handleAskQuestion()}
              disabled={pending || reachedTurnLimit}
              placeholder="Ask about AI strategy, adoption, agentic workflows..."
              inputRef={askInputRef}
            />
            <DemoLimitStatus title={statusTitle} description={statusDescription} />
            <ExamplePromptChips
              prompts={suggestions}
              onSelect={handlePromptSelect}
              disabled={pending || reachedTurnLimit}
            />
          </div>
        ) : (
          /* Conversation */
          <div className="space-y-5">
            {turns.map((turn, idx) => (
              <div key={idx}>
                {turn.role === "assistant" ? (
                  <div className="rounded-xl border border-secondary bg-primary px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                      Research assistant
                    </p>
                    <div
                      className="cm-readable-prose mt-2 space-y-3 text-sm leading-7 text-secondary"
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
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-br-md bg-brand-solid px-4 py-3 text-left text-sm leading-6 text-primary_on-brand shadow-xs-skeuomorphic">
                      {turn.content}
                    </div>
                  </div>
                )}

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
        {turns.length > 0 && (
          <div className="sticky bottom-0 z-10 mt-6 -mx-4 px-4 pt-4 pb-6">
            <div className="cm-ask-composer-stack mx-auto w-full max-w-2xl">
              {!reachedTurnLimit && (
                <HeroAskInput
                  value={input}
                  onChange={setInput}
                  onSubmit={() => void handleAskQuestion()}
                  disabled={pending}
                  placeholder="Ask about AI strategy, adoption, agentic workflows..."
                  inputRef={askInputRef}
                />
              )}
              <div className="cm-ask-shelf mx-auto flex min-h-9 items-center justify-between gap-3 px-5 py-2">
                <DemoLimitStatus title={statusTitle} description={statusDescription} align="left" />
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
            </div>
          </div>
        )}
      </div>

      <OpenSourceSection />
      <SiteFooter />
    </div>
  );
}

function DemoLimitStatus({
  title,
  description,
  align = "center",
}: {
  title: string;
  description: string;
  align?: "left" | "center";
}) {
  const className =
    align === "center"
      ? "mt-2 text-center text-xs leading-5 text-tertiary"
      : "min-w-0 truncate text-left text-xs leading-5 text-tertiary";

  return (
    <p className={className}>
      <span className="font-medium text-tertiary">
        {title}
      </span>
      <span className="px-2 text-quaternary">·</span>
      {description}
    </p>
  );
}
