import { useMemo } from "react";
import { ArrowRight } from "@untitledui/icons";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ConfidenceBadge, StatusBadge } from "@/components/Badges";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness, formatDateLabel, getThemePosture, summarizeText } from "@/lib/workspace-utils";

export default function ThemePage() {
  const { activeTheme, themePositions, navigate } = useWorkspace();

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
      <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Theme overview
        </p>
        <h1 className="mt-3 text-display-xs font-semibold tracking-[-0.02em] text-slate-950">
          {activeTheme.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-8 text-slate-600">
          {activeTheme.description ?? "Open a position to see the current stance and evidence chain."}
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

      {/* Posture cards */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {posture.cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-base font-semibold text-slate-950">{card.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
          </div>
        ))}
      </div>

      {/* Positions list */}
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold text-slate-950">Positions</h2>
          <Badge type="color" size="sm" color="gray">
            {sortedPositions.length} total
          </Badge>
        </div>

        <div className="mt-4 space-y-3">
          {sortedPositions.map((position: any) => {
            const stance = position.currentVersion?.currentStance ?? position.currentStance;
            const confidence = position.currentVersion?.confidenceLevel ?? position.confidenceLevel;
            const status = position.currentVersion?.status ?? position.status;
            const versionDate = position.currentVersion?.versionDate ?? position.versionDate;

            return (
              <button
                key={position._id}
                type="button"
                onClick={() => navigate(`/positions/${position._id}`)}
                className="group w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {status && <StatusBadge status={status} />}
                      {confidence && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    <p className="mt-3 text-base font-semibold leading-7 text-slate-950">{position.title}</p>
                    {stance && (
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {summarizeText(stance, 220)}
                      </p>
                    )}
                    {versionDate && (
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        Updated {formatDateLabel(versionDate)}
                      </p>
                    )}
                  </div>
                  <div className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-utility-brand-700">
                    Open
                    <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
