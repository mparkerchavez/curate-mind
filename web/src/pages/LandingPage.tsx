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
    <div className="bg-primary">
      {/* Hero — subtle brand tint band (bg-brand-section_subtle) for the
          "colorful but readable" opening beat UUI prescribes. */}
      <section className="bg-brand-section_subtle">
        <div className="mx-auto max-w-4xl px-6 pt-8 pb-12 text-center lg:pb-16">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Curate Mind &middot; Feb 2026 &middot; Research ongoing
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-lg font-semibold tracking-[-0.025em] text-primary">
            A curated research base on AI strategy. Ask anything. Trace every claim.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-tertiary">
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
          <p className="mx-auto mt-3 max-w-xl text-sm text-tertiary">
            Answers are grounded in a curated set of sources.
            Every claim can be traced back to its original quote.
          </p>

          {/* Example chips */}
          <ExamplePromptChips
            prompts={EXAMPLE_PROMPTS}
            onSelect={handleChipSelect}
            disabled={pending}
          />

          {/* Proof line — compact stat string under the chips */}
          <p className="mt-8 text-sm text-tertiary">
            Drawing from 178 sources &middot; 1,561 data points &middot;{" "}
            {allPositions?.length ?? 28} positions across {sortedThemes.length || 11} themes
          </p>
        </div>
      </section>

      {/* Example position + methodology teaser on clean white
          (bg-primary). Brand-tinted hero above, white middle content,
          off-white themes below, dark coda at the bottom. */}
      <div className="bg-primary py-14 lg:py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Example position
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-primary">
              How claims, evidence, and sources connect.
            </h2>
            <p className="mt-3 text-base leading-7 text-tertiary">
              Ask anything, and your answer traces back the same way.
            </p>
          </div>
          <div className="mt-10">
            <LivePositionDemo positionId={flagshipId} />
          </div>
        </div>

        {/* Methodology teaser, inside the same white band */}
        <div className="mx-auto mt-10 max-w-2xl px-6">
          <MethodologyTeaser />
        </div>
      </div>

      {/* Themes grid on off-white (bg-secondary) — breaks up the white
          middle content and separates visually from the dark coda. */}
      <div className="bg-secondary py-14 lg:py-16">
        <section className="mx-auto max-w-4xl px-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                Research themes
              </p>
              <h2 className="mt-2 text-xl font-semibold text-primary">
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
      </div>

      {/* Open source coda — renders its own bg-brand-section dark band */}
      <OpenSourceSection />

      {/* Footer — same deep brand as the open source section, with a
          hair-thin light divider inside so the seam is still readable. */}
      <footer className="bg-brand-section">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 border-t border-white/10 px-6 py-8 text-center text-sm text-tertiary_on-brand sm:flex-row sm:justify-between sm:text-left">
          <p>
            Curate Mind &middot; built by Maicol Parker-Chavez &middot;{" "}
            {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-5">
            <Link
              to="/methodology"
              className="transition hover:text-primary_on-brand"
            >
              Methodology
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-primary_on-brand"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
