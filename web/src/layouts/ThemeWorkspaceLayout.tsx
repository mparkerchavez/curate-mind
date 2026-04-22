import { useMemo } from "react";
import { Outlet, useParams } from "react-router-dom";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness } from "@/lib/workspace-utils";
import { cn } from "@/lib/cn";

const RAIL_WIDTH = 288;

const STATUS_DOT: Record<string, string> = {
  emerging: "bg-warning-solid",
  active: "bg-brand-solid",
  established: "bg-success-solid",
  evolved: "bg-utility-blue-500",
  retired: "bg-error-solid",
};

/**
 * Three-column workspace layout for theme + position routes.
 *
 * Left rail: sticky theme header + sibling positions list.
 * Middle column: <Outlet /> renders ThemePage (overview) or PositionPage.
 * Right column: the existing EvidencePanel (rendered by AppShell when the
 * route has evidence — this layout doesn't touch it).
 */
export default function ThemeWorkspaceLayout() {
  const { activeTheme, themePositions, navigate } = useWorkspace();
  const { themeId, positionId } = useParams<{ themeId: string; positionId?: string }>();

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

  return (
    <div className="flex min-h-full">
      <aside
        style={{ "--rail-width": `${RAIL_WIDTH}px` } as React.CSSProperties}
        className="sticky top-0 hidden h-screen shrink-0 border-r border-secondary bg-primary lg:block lg:w-(--rail-width)"
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 py-6">
          {/* Theme header */}
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Theme
            </p>
            <h2 className="mt-2 text-base font-semibold leading-6 text-primary">
              {activeTheme.title}
            </h2>
            {activeTheme.description && (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-tertiary">
                {activeTheme.description}
              </p>
            )}
          </div>

          {/* Positions list */}
          <div className="mt-7">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
              Positions
              <span className="ml-1.5 text-quaternary/70 tabular-nums">
                {sortedPositions.length}
              </span>
            </p>
            <nav className="mt-2 -mx-2">
              {sortedPositions.map((position: any) => {
                const isActive = String(position._id) === String(positionId);
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
                    {/* Active accent bar */}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full bg-brand-solid"
                      />
                    )}
                    {/* Status dot */}
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

      {/* Middle column — renders ThemePage (overview) or PositionPage. */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
