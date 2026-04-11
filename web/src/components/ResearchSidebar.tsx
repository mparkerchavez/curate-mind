import { useMemo } from "react";
import { ChevronDown, ArrowRight } from "@untitledui/icons";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/components/base/badges/badges";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";
import { summarizeText } from "@/lib/workspace-utils";

export default function ResearchSidebar() {
  const { themes, allPositions, themePositions, routeKind, navigate } = useWorkspace();
  const location = useLocation();

  const sortedThemes = useMemo(
    () =>
      [...(themes ?? [])].sort((a: any, b: any) => {
        const diff = (b.positionCount ?? 0) - (a.positionCount ?? 0);
        if (diff !== 0) return diff;
        return String(a.title ?? "").localeCompare(String(b.title ?? ""));
      }),
    [themes],
  );

  const isHome = location.pathname === "/";

  return (
    <div className="flex h-full flex-col">
      {/* Stats header */}
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Feb 2026 Research
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge type="color" size="sm" color="gray">
            {sortedThemes.length} themes
          </Badge>
          <Badge type="color" size="sm" color="gray">
            {allPositions?.length ?? 0} positions
          </Badge>
        </div>
      </div>

      {/* Navigation tree */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* Home link */}
        <Link
          to="/"
          className={cn(
            "mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
            isHome
              ? "bg-utility-brand-50 text-utility-brand-700"
              : "text-slate-700 hover:bg-slate-50",
          )}
        >
          Overview
        </Link>

        {/* Theme sections */}
        <div className="mt-2 space-y-0.5">
          {sortedThemes.map((theme: any) => (
            <ThemeSection key={theme._id} theme={theme} currentPath={location.pathname} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function ThemeSection({ theme, currentPath }: { theme: any; currentPath: string }) {
  const isThemeActive = currentPath === `/themes/${theme._id}`;
  const isChildActive = currentPath.startsWith("/positions/");

  return (
    <details
      className="group"
      open={isThemeActive || undefined}
    >
      <summary className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition select-none",
        isThemeActive
          ? "bg-utility-brand-50 text-utility-brand-700"
          : "text-slate-700 hover:bg-slate-50",
      )}>
        <ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
        <span className="flex-1 truncate">{theme.title}</span>
        <Badge type="color" size="sm" color="gray">
          {theme.positionCount ?? 0}
        </Badge>
      </summary>

      <div className="ml-4 border-l border-slate-200 pl-2">
        <Link
          to={`/themes/${theme._id}`}
          className={cn(
            "mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            isThemeActive ? "text-utility-brand-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
          )}
        >
          View theme
          <ArrowRight className="size-3" />
        </Link>

        {theme._positions?.map((position: any) => {
          const isActive = currentPath === `/positions/${position._id}`;
          return (
            <Link
              key={position._id}
              to={`/positions/${position._id}`}
              className={cn(
                "mt-0.5 block rounded-lg px-3 py-1.5 text-xs transition",
                isActive
                  ? "bg-utility-brand-50 font-medium text-utility-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {summarizeText(position.title, 50)}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
