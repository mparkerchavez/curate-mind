import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api, Id } from "../api";
import LineagePanel, { RetrievedDP } from "./LineagePanel";

type Turn = {
  role: "user" | "assistant";
  content: string;
  retrieved?: RetrievedDP[];
  citedIds?: string[];
};

const MAX_TURNS = 3; // user turns

export default function ChatInterface({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const ask = useAction(api.chat.askGrounded);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userTurnsCount = turns.filter((t) => t.role === "user").length;
  const reachedLimit = userTurnsCount >= MAX_TURNS;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, pending]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || pending || reachedLimit) return;
    const question = input.trim();
    setInput("");
    setError(null);

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setPending(true);

    try {
      const result = await ask({
        question,
        projectId,
        conversationHistory: history,
      });
      setTurns([
        ...next,
        {
          role: "assistant",
          content: result.answer,
          retrieved: result.retrievedDataPoints as RetrievedDP[],
          citedIds: result.citedDataPointIds,
        },
      ]);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong calling the chat action.");
      setTurns(next); // leave the user turn in place
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setTurns([]);
    setInput("");
    setError(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="scroll-soft flex-1 space-y-8 overflow-y-auto pr-2"
      >
        {turns.length === 0 && (
          <div className="rounded-sm border border-dashed border-rule p-8 text-inkSoft">
            <div className="display text-2xl text-ink">
              Ask the February 2026 corpus.
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed">
              This assistant only answers from the data points and sources
              curated into this knowledge base. Two to three turns per
              conversation, then start fresh.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-rule px-3 py-1.5 text-xs text-inkSoft transition-colors hover:border-ochre/60 hover:text-ochreDeep"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="rise-in">
            {t.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-2xl rounded-sm border border-ochre/40 bg-ochre/[0.06] px-5 py-3 text-[15px] text-ink">
                  <div className="label mb-1 text-ochreDeep">You</div>
                  {t.content}
                </div>
              </div>
            ) : (
              <div>
                <div className="label mb-2 text-inkMute">Curate Mind</div>
                <div className="prose-quote whitespace-pre-wrap text-[15px] leading-relaxed text-inkSoft">
                  {t.content}
                </div>
                {t.retrieved && (
                  <LineagePanel
                    retrieved={t.retrieved}
                    citedIds={t.citedIds ?? []}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex items-center gap-3 text-inkMute">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ochre" />
            <span className="label">Thinking through the evidence…</span>
          </div>
        )}

        {error && (
          <div className="rounded-sm border border-ochreDeep/50 bg-ochre/10 p-4 text-sm text-ochreDeep">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 border-t border-rule/70 pt-5"
      >
        <div className="flex items-start gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              reachedLimit
                ? "Conversation full — start a new one to continue."
                : "Ask about the February 2026 AI research…"
            }
            disabled={pending || reachedLimit}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
            className="min-h-[3.5rem] flex-1 resize-y rounded-sm border border-rule bg-paper/80 px-4 py-3 text-[15px] text-ink placeholder:text-inkMute focus:border-ochre focus:outline-none disabled:opacity-50"
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={pending || reachedLimit || !input.trim()}
              className="label rounded-sm bg-ink px-4 py-3 text-paper transition-colors hover:bg-ochreDeep disabled:cursor-not-allowed disabled:bg-inkMute"
            >
              {pending ? "Asking…" : "Ask →"}
            </button>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="label rounded-sm border border-rule px-4 py-2 text-inkSoft hover:border-ochre/60 hover:text-ochreDeep"
              >
                New conversation
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-inkMute">
          <span>⌘/Ctrl + Enter to send</span>
          <span>
            {userTurnsCount} / {MAX_TURNS} turns used
          </span>
        </div>
      </form>
    </div>
  );
}

const SUGGESTIONS = [
  "What's emerging about agentic workflows in the enterprise?",
  "Where does the research disagree on AI adoption pace?",
  "What patterns predict successful GenAI pilots?",
];
