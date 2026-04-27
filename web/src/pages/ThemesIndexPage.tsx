import { useMemo } from "react";
import { Badge } from "@/components/base/badges/badges";
import { ThemeCard } from "@/components/ThemeCard";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function ThemesIndexPage() {
  const { themes, allPositions, navigate } = useWorkspace();

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
    const map: Record<string, string> = {};
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
  }, [allPositions]);

  return (
    <div className="bg-secondary py-10 lg:py-14">
      <section className="mx-auto max-w-4xl px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Research themes
            </p>
            <h1 className="mt-2 text-display-xs font-semibold tracking-[-0.01em] text-primary lg:text-display-sm">
              Browse the corpus by thread
            </h1>
            <p className="mt-3 text-sm leading-6 text-tertiary">
              Drawing from 178 sources &middot; 1,561 data points &middot;{" "}
              {allPositions?.length ?? 28} positions across{" "}
              {sortedThemes.length || 11} themes.
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
    </div>
  );
}
