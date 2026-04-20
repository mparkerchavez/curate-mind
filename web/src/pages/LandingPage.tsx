import { useMemo, useRef, useState } from "react";
import { ArrowRight } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { ExamplePromptChips } from "@/components/ExamplePromptChips";
import { HeroAskInput } from "@/components/HeroAskInput";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness, formatDateLabel, summarizeText } from "@/lib/workspace-utils";

// Phase 2 placeholder prompts. Phase 8 swaps these for real questions
// workshopped against the corpus.
const PLACEHOLDER_PROMPTS = [
  "How is AI changing software development?",
  "What does the evidence say about enterprise AI adoption?",
  "Is augmentation or automation winning in practice?",
  "Where do agentic workflows break down?",
];

export default function LandingPage() {
  const { themes, allPositions, navigate, handleAskQuestion, pending } = useWorkspace();

  const [heroInput, setHeroInput] = useState("");
  const heroInputRef = useRef<HTMLTextAreaElement>(null);

  function handleHeroSubmit() {
    const question = heroInput.trim();
    if (!question) return;
    // Kick off the async query first so the AskPage renders the in-flight
    // conversation immediately on mount. React batches both state updates.
    void handleAskQuestion(question);
    navigate("/ask");
    setHeroInput("");
  }

  function handleChipSelect(prompt: string) {
    setHeroInput(prompt);
    // Focus the input and move the cursor to the end after state flushes.
    requestAnimationFrame(() => {
      const el = heroInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const sortedThemes = useMemo(
    () =>
      [...(themes ?? [])].sort((a: any, b: any) => {
        const diff = (b.positionCount ?? 0) - (a.positionCount ?? 0);
        return diff !== 0 ? diff : String(a.title ?? "").localeCompare(String(b.title ?? ""));
      }),
    [themes],
  );

  const featuredPositions = useMemo(
    () => [...(allPositions ?? [])].sort(comparePositionsByFreshness).slice(0, 5),
    [allPositions],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Hero */}
      <section className="py-12 text-center lg:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Curate Mind &middot; Feb 2026 &middot; Research ongoing
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-display-md font-semibold tracking-[-0.02em] text-slate-950">
          A curated research base on AI strategy. Ask anything. Trace every claim.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600">
          178 sources chosen and distilled into data points, positions, and themes.
          A researcher's point of view, not a search result.
        </p>

        {/* Ask input */}
        <div className="mt-8">
          <HeroAskInput
            value={heroInput}
            onChange={setHeroInput}
            onSubmit={handleHeroSubmit}
            disabled={pending}
            inputRef={heroInputRef}
          />
        </div>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
          Answers are grounded in a curated set of sources.
          Every claim can be traced back to its original quote.
        </p>

        {/* Example chips */}
        <ExamplePromptChips
          prompts={PLACEHOLDER_PROMPTS}
          onSelect={handleChipSelect}
          disabled={pending}
        />

        {/* Proof line — replaces the former 4-stat card grid */}
        <p className="mt-8 text-sm text-slate-500">
          Drawing from 178 sources &middot; 1,561 data points &middot;{" "}
          {allPositions?.length ?? 28} positions across {sortedThemes.length || 11} themes
        </p>
      </section>

      {/* Themes grid — typography matches evidence card 20/16/12 scale */}
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Research themes
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Explore by thread
            </h2>
          </div>
          <Badge type="color" size="sm" color="gray">
            {sortedThemes.length} total
          </Badge>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {sortedThemes.map((theme: any) => (
            <button
              key={theme._id}
              type="button"
              onClick={() => navigate(`/themes/${theme._id}`)}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
            >
              {/* Card header — matches evidence card header hierarchy */}
              <div className="px-5 pt-5 pb-4">
                <p className="text-xl font-semibold leading-7 tracking-[-0.01em] text-slate-950">
                  {theme.title}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {summarizeText(theme.description ?? "", 140)}
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {theme.positionCount ?? 0} positions
                </p>
              </div>
              {/* Card footer — quiet action link */}
              <div className="border-t border-slate-100 px-5 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-utility-brand-700">
                  Explore
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Recently active positions */}
      <section className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Recently active positions
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Latest movement
        </h2>
        <div className="mt-4 space-y-3">
          {featuredPositions.map((position: any) => (
            <PositionRow
              key={position._id}
              position={position}
              onOpen={() => navigate(`/positions/${position._id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PositionRow({ position, onOpen }: { position: any; onOpen: () => void }) {
  const stance = position.currentVersion?.currentStance ?? position.currentStance;
  const versionDate = position.currentVersion?.versionDate ?? position.versionDate;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            {position.themeTitle ?? "Position"}
          </p>
          <p className="mt-2 text-base font-semibold leading-7 text-slate-950">{position.title}</p>
          {stance && (
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {summarizeText(stance, 200)}
            </p>
          )}
          {versionDate && (
            <p className="mt-2 text-xs text-slate-500">
              Updated {formatDateLabel(versionDate)}
            </p>
          )}
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-utility-brand-600" />
      </div>
    </button>
  );
}
