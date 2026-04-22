import { useMemo } from "react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { LegendPopover } from "@/components/LegendPopover";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness, formatDateLabel } from "@/lib/workspace-utils";
import { THEME_LEGEND_ROWS } from "@/lib/legend-copy";

/**
 * Theme overview — the middle column when no position is selected.
 * The left rail (in AppShell) already surfaces theme title + positions
 * list, so this page focuses on framing: what the theme is about.
 */
export default function ThemePage() {
  const { activeTheme, themePositions } = useWorkspace();

  const sortedPositions = useMemo(
    () => [...(themePositions ?? [])].sort(comparePositionsByFreshness),
    [themePositions],
  );

  if (!activeTheme) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading theme" />
      </div>
    );
  }

  const latestVersionDate = sortedPositions[0]?.currentVersion?.versionDate ?? sortedPositions[0]?.versionDate;
  const metaBits = [
    `${sortedPositions.length} position${sortedPositions.length === 1 ? "" : "s"}`,
    latestVersionDate ? `Updated ${formatDateLabel(latestVersionDate)}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
        Theme
      </p>

      <div className="mt-3 flex items-start gap-2">
        <h1 className="text-display-sm font-semibold tracking-[-0.02em] text-primary 2xl:text-display-md">
          {activeTheme.title}
        </h1>
        <span className="mt-2 shrink-0 2xl:mt-3">
          <LegendPopover
            heading="Position status"
            rows={THEME_LEGEND_ROWS}
            ariaLabel="What do position status labels mean?"
          />
        </span>
      </div>

      {activeTheme.description && (
        <p className="mt-4 text-base leading-7 text-tertiary">
          {activeTheme.description}
        </p>
      )}

      {metaBits.length > 0 && (
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
          {metaBits.join(" \u00b7 ")}
        </p>
      )}

      <p className="mt-10 text-sm leading-6 text-tertiary">
        Open a position from the left to see the current stance and evidence chain.
      </p>
    </div>
  );
}
