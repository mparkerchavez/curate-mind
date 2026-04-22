import { useMemo } from "react";
import { LegendPopover } from "@/components/LegendPopover";
import { Select } from "@/components/base/select/select";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness } from "@/lib/workspace-utils";
import { THEME_LEGEND_ROWS } from "@/lib/legend-copy";
import { cn } from "@/lib/cn";

const STATUS_DOT: Record<string, string> = {
  emerging: "bg-warning-solid",
  active: "bg-brand-solid",
  established: "bg-success-solid",
  evolved: "bg-utility-blue-500",
  retired: "bg-error-solid",
};

/**
 * Left rail for the theme workspace.
 *
 * Rendered by AppShell as a sibling of <main>, so it lives outside main's
 * scroll area and stays visible without needing `position: sticky`.
 *
 * Width shrinks to 240px on smaller laptops (1024–1439) and grows to 288px
 * at ≥1440 so the middle column has enough room on a 13" display.
 */
export default function ThemeRail() {
  const { activeTheme, themes, themePositions, positionDetail, navigate } = useWorkspace();

  const sortedPositions = useMemo(
    () => [...(themePositions ?? [])].sort(comparePositionsByFreshness),
    [themePositions],
  );

  const themeItems = useMemo(() => {
    return [...(themes ?? [])]
      .sort((a: any, b: any) =>
        String(a.title ?? "").localeCompare(String(b.title ?? "")),
      )
      .map((t: any) => ({ id: String(t._id), label: t.title as string }));
  }, [themes]);

  if (!activeTheme) return null;

  const themeId = String(activeTheme._id);
  const activePositionId = positionDetail?._id ? String(positionDetail._id) : undefined;

  return (
    <aside className="hidden h-full shrink-0 overflow-y-auto border-r border-secondary bg-primary lg:block lg:w-60 2xl:w-72">
      <div className="flex flex-col px-5 py-6">
        {/* Theme header — UUI Select as the primary switcher affordance. */}
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Theme
          </p>
          <div className="mt-2">
            <Select
              aria-label="Switch theme"
              size="sm"
              selectedKey={themeId}
              onSelectionChange={(key) => {
                if (!key || String(key) === themeId) return;
                const selected = (themes ?? []).find(
                  (t: any) => String(t._id) === String(key),
                );
                const firstPositionId = selected?.firstPositionId;
                navigate(
                  firstPositionId
                    ? `/themes/${key}/positions/${firstPositionId}`
                    : `/themes/${key}`,
                );
              }}
              items={themeItems}
              popoverClassName="w-72"
            >
              {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
          </div>
          {activeTheme.description && (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-tertiary">
              {activeTheme.description}
            </p>
          )}
        </div>

        {/* Positions list */}
        <div className="mt-7">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Positions
              <span className="ml-1.5 text-quaternary/70 tabular-nums">
                {sortedPositions.length}
              </span>
            </p>
            <LegendPopover
              heading="Position status"
              rows={THEME_LEGEND_ROWS}
              ariaLabel="What do position status labels mean?"
              placement="bottom start"
            />
          </div>
          <nav className="mt-2 -mx-2">
            {sortedPositions.map((position: any) => {
              const isActive = String(position._id) === activePositionId;
              const status =
                position.currentVersion?.status ?? position.status ?? "active";
              const dotClass = STATUS_DOT[status] ?? "bg-fg-quaternary";

              return (
                <button
                  key={position._id}
                  type="button"
                  onClick={() =>
                    navigate(`/themes/${themeId}/positions/${position._id}`)
                  }
                  className={cn(
                    "group relative flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition duration-100 ease-linear",
                    isActive
                      ? "bg-brand-primary/40"
                      : "hover:bg-secondary",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-brand-solid"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotClass)}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-sm leading-5",
                      isActive
                        ? "font-semibold text-brand-secondary"
                        : "font-medium text-secondary group-hover:text-primary",
                    )}
                  >
                    {position.title}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
