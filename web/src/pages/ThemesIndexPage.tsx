import { useMemo } from "react";
import { Badge } from "@/components/base/badges/badges";
import { OpenSourceSection } from "@/components/OpenSourceSection";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeCard } from "@/components/ThemeCard";
import { CORPUS_FRESHNESS_LABEL } from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { buildCorpusLine } from "@/lib/workspace-utils";

export default function ThemesIndexPage() {
  const { themes, allPositions, corpusStats, navigate } = useWorkspace();

  const sortedThemes = useMemo(
    () =>
      [...(themes ?? [])].sort((a: any, b: any) => {
        const diff = (b.positionCount ?? 0) - (a.positionCount ?? 0);
        return diff !== 0
          ? diff
          : String(a.title ?? "").localeCompare(String(b.title ?? ""));
      }),
    [themes],
  );

  const lastUpdatedByTheme = useMemo(() => {
    const map: Record<string, string> = { ...(corpusStats?.lastUpdatedByTheme ?? {}) };
    for (const p of allPositions ?? []) {
      const themeId = String(p.themeId ?? "");
      const date: string | undefined =
        p.currentVersion?.versionDate ?? p.versionDate;
      if (!themeId || !date) continue;
      const existing = map[themeId];
      if (!existing || Date.parse(date) > Date.parse(existing)) {
        map[themeId] = date;
      }
    }
    return map;
  }, [allPositions, corpusStats]);

  const corpusLine = buildCorpusLine({
    freshnessLabel: CORPUS_FRESHNESS_LABEL,
    corpusStats,
    positionCount: allPositions?.length,
    themeCount: sortedThemes.length,
  });

  return (
    <div className="bg-primary">
      <section className="mx-auto max-w-4xl px-6 py-10 lg:py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Research themes
            </p>
            <h1 className="mt-2 text-display-xs font-semibold tracking-[-0.01em] text-primary lg:text-display-sm">
              Browse the corpus by thread
            </h1>
            <p className="mt-3 text-sm leading-6 text-tertiary">
              {corpusLine}
            </p>
          </div>
          <Badge type="color" size="sm" color="gray">
            {sortedThemes.length} total
          </Badge>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
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

      <OpenSourceSection />
      <SiteFooter />
    </div>
  );
}
