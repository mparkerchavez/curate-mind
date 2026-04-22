import { useMemo } from "react";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { LegendPopover } from "@/components/LegendPopover";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness, getThemePosture } from "@/lib/workspace-utils";
import { THEME_LEGEND_ROWS } from "@/lib/legend-copy";

/**
 * Theme overview — renders in the middle column of ThemeWorkspaceLayout
 * when no position is selected. The left rail handles the positions list,
 * so this page focuses on context: what the theme is and how it's trending.
 *
 * The posture cards below are a transitional state — commit 3 will
 * simplify them into a compact meta line.
 */
export default function ThemePage() {
  const { activeTheme, themePositions } = useWorkspace();

  const sortedPositions = useMemo(
    () => [...(themePositions ?? [])].sort(comparePositionsByFreshness),
    [themePositions],
  );

  const posture = useMemo(
    () => getThemePosture(themePositions ?? []),
    [themePositions],
  );

  if (!activeTheme) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading theme" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Theme header */}
      <section className="rounded-3xl border border-secondary bg-secondary_subtle p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
          Theme overview
        </p>
        <div className="mt-3 flex items-start gap-2">
          <h1 className="text-display-xs font-semibold tracking-[-0.02em] text-primary">
            {activeTheme.title}
          </h1>
          <span className="mt-2">
            <LegendPopover
              heading="Position status"
              rows={THEME_LEGEND_ROWS}
              ariaLabel="What do position status labels mean?"
            />
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-base leading-8 text-tertiary">
          {activeTheme.description ?? "Open a position from the left to see the current stance and evidence chain."}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <BadgeWithDot type="pill-color" size="sm" color="gray">
            {sortedPositions.length} positions
          </BadgeWithDot>
          <BadgeWithDot type="pill-color" size="sm" color="brand">
            {posture.confidenceSummary}
          </BadgeWithDot>
          <BadgeWithDot type="pill-color" size="sm" color="gray">
            {posture.latestFreshness}
          </BadgeWithDot>
        </div>
      </section>

      {/* Posture cards — transitional; commit 3 will simplify or remove. */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {posture.cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-secondary bg-primary p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              {card.label}
            </p>
            <p className="mt-2 text-base font-semibold text-primary">{card.value}</p>
            <p className="mt-2 text-sm leading-6 text-tertiary">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
