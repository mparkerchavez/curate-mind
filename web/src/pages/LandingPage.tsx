import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/base/badges/badges";
import { ExamplePromptChips } from "@/components/ExamplePromptChips";
import { HeroAskInput } from "@/components/HeroAskInput";
import { LivePositionDemo } from "@/components/LivePositionDemo";
import { MethodologyTeaser } from "@/components/MethodologyTeaser";
import { OpenSourceSection } from "@/components/OpenSourceSection";
import { ThemeCard } from "@/components/ThemeCard";
import {
  EXAMPLE_PROMPTS,
  FLAGSHIP_POSITION_ID,
  GITHUB_URL,
} from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { navigateWithTransition } from "@/utils/navigateWithTransition";

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
    // Wrap the route change in a View Transition so the hero input
    // morphs into the Ask page input (see navigateWithTransition).
    navigateWithTransition(() => navigate("/ask"));
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

  // Derive "most recently updated position date" per theme so theme cards
  // can show a freshness line without any backend changes.
  const lastUpdatedByTheme = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of allPositions ?? []) {
      const themeId = String(p.themeId ?? "");
      const date: string | undefined = p.currentVersion?.versionDate ?? p.versionDate;
      if (!themeId || !date) continue;
      const existing = map[themeId];
      if (!existing || Date.parse(date) > Date.parse(existing)) {
        map[themeId] = date;
      }
    }
    return map;
  }, [allPositions]);

  // Flagship position for the live demo (hand-picked, see config/homepage).
  const flagshipId = FLAGSHIP_POSITION_ID;

  return (
    <div className="pt-8">
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-12 text-center lg:py-16">
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
          prompts={EXAMPLE_PROMPTS}
          onSelect={handleChipSelect}
          disabled={pending}
        />

        {/* Proof line — replaces the former 4-stat card grid */}
        <p className="mt-8 text-sm text-slate-500">
          Drawing from 178 sources &middot; 1,561 data points &middot;{" "}
          {allPositions?.length ?? 28} positions across {sortedThemes.length || 11} themes
        </p>
      </section>

      {/* Live Position demo on a tinted band for visual separation.
          The mini-app container stays white and gets a stronger shadow,
          so it reads as elevated against the slate-50 backdrop. */}
      <div className="mt-8 bg-slate-50 py-14 lg:py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Example position
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-slate-950">
              How claims, evidence, and sources connect.
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Ask anything, and your answer traces back the same way.
            </p>
          </div>
          <div className="mt-10">
            <LivePositionDemo positionId={flagshipId} />
          </div>
        </div>
      </div>

      {/* Methodology teaser */}
      <div className="mx-auto mt-12 max-w-2xl px-6">
        <MethodologyTeaser />
      </div>

      {/* Themes grid */}
      <section className="mx-auto mt-12 max-w-4xl px-6">
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
            <ThemeCard
              key={theme._id}
              theme={theme}
              lastUpdatedDate={lastUpdatedByTheme[String(theme._id)]}
              onOpen={() => navigate(`/themes/${theme._id}`)}
            />
          ))}
        </div>
      </section>

      {/* Open source coda — full-bleed, subtle gray background */}
      <div className="mt-16">
        <OpenSourceSection />
      </div>

      {/* Footer — dark band, pairs visually with the Open Source
          section above it to form a single bottom zone. */}
      <footer className="bg-slate-950">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-slate-400 sm:flex-row sm:justify-between sm:text-left">
          <p>
            Curate Mind &middot; built by Maicol Parker-Chavez &middot;{" "}
            {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-5">
            <Link
              to="/methodology"
              className="transition hover:text-white"
            >
              Methodology
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-white"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
