import { useEffect, useRef } from "react";
import { ArrowRight, MessageChatCircle, RefreshCcw01, SearchLg } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { TextAreaBase } from "@/components/base/textarea/textarea";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import SourceEvidenceGroup from "@/components/SourceEvidenceGroup";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";
import {
  getSuggestions,
  groupDataPointsBySource,
  renderAnswerBlocks,
} from "@/lib/workspace-utils";

export default function ChatPanel() {
  const {
    turns,
    input,
    setInput,
    pending,
    error,
    handleAskQuestion,
    resetConversation,
    reachedTurnLimit,
    activeAnswer,
    highlightedEvidenceId,
    focusAnswerEvidence,
  } = useWorkspace();

  const bottomRef = useRef<HTMLDivElement>(null);
  const suggestions = getSuggestions("home"); // always corpus-wide suggestions

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageChatCircle className="size-5 text-utility-brand-600" />
          <h2 className="text-sm font-semibold text-slate-950">Ask the research base</h2>
        </div>
      </div>

      {/* Conversation + evidence area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              size="sm"
              className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6"
            >
              <EmptyState.Header pattern="none">
                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
              </EmptyState.Header>
              <EmptyState.Content>
                <EmptyState.Title>Ask about the research</EmptyState.Title>
                <EmptyState.Description>
                  Every answer is grounded in the curated knowledge base with citations you can trace back to original sources.
                </EmptyState.Description>
              </EmptyState.Content>
            </EmptyState>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Suggested prompts
              </p>
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleAskQuestion(prompt)}
                  className="group w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm leading-6 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>{prompt}</span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-utility-brand-600" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, idx) => (
              <div key={idx}>
                <div
                  className={cn(
                    "rounded-xl border px-3 py-3",
                    turn.role === "user"
                      ? "border-utility-brand-200 bg-utility-brand-50"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    {turn.role === "user" ? "You" : "Research assistant"}
                  </p>
                  {turn.role === "assistant" ? (
                    <div className="mt-2 space-y-3 text-sm leading-7 text-slate-700">
                      {renderAnswerBlocks(
                        turn.content,
                        new Map(turn.answerState.citations.map((c) => [c.label, c.dataPointId])),
                        (dpId) => focusAnswerEvidence(turn.answerState, dpId),
                        {
                          highlightedDpId:
                            activeAnswer === turn.answerState ? highlightedEvidenceId : null,
                        },
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-slate-700">{turn.content}</p>
                  )}
                </div>

                {/* Inline evidence after assistant turns — grouped by source */}
                {turn.role === "assistant" && turn.answerState.retrievedDataPoints.length > 0 && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        Evidence
                      </p>
                      <p className="text-xs text-slate-500">
                        {turn.answerState.citedDataPointIds.length} cited of {turn.answerState.retrievedDataPoints.length}
                      </p>
                    </div>
                    {groupDataPointsBySource(turn.answerState.retrievedDataPoints).map((group) => (
                      <SourceEvidenceGroup
                        key={group.key}
                        group={group}
                        highlightedId={highlightedEvidenceId}
                        citedIds={turn.answerState.citedDataPointIds}
                        labelByDpId={Object.fromEntries(
                          turn.answerState.citations.map((c) => [c.dataPointId, c.label]),
                        )}
                        onClaimClick={(dpId) => focusAnswerEvidence(turn.answerState, dpId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {pending && (
              <div className="rounded-xl border border-utility-brand-200 bg-utility-brand-50 px-3 py-3 text-sm text-utility-brand-700">
                Thinking through the evidence...
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-utility-red-200 bg-utility-red-50 px-3 py-3 text-sm text-utility-red-700">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-4">
        {turns.length > 0 && (
          <div className="mb-3 flex justify-end">
            <Button size="xs" color="tertiary" iconLeading={RefreshCcw01} onClick={resetConversation}>
              Reset
            </Button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAskQuestion();
          }}
        >
          <TextAreaBase
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleAskQuestion();
              }
            }}
            rows={3}
            disabled={pending || reachedTurnLimit}
            placeholder={
              reachedTurnLimit
                ? "Turn limit reached. Reset to continue."
                : "Ask about AI strategy, adoption, agentic workflows..."
            }
            className="min-h-[4.5rem] resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Enter to send · Shift + Enter for new line
            </p>
            <Button
              type="submit"
              size="sm"
              color="primary"
              iconTrailing={ArrowRight}
              disabled={pending || reachedTurnLimit || !input.trim()}
            >
              {pending ? "Asking..." : "Ask"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
