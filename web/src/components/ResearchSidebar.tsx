import { useMemo } from "react";
import { ChevronDown } from "@untitledui/icons";
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

  return (
    <div>
      <Link
        to={`/themes/${theme._id}`}
        className={cn(
          "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
          isThemeActive
            ? "bg-utility-brand-50 text-utility-brand-700"
            : "text-slate-700 hover:bg-slate-50",
        )}
      >
        <span className="flex-1 whitespace-normal break-words leading-5 line-clamp-2">
          {theme.title}
        </span>
        <Badge type="color" size="sm" color="gray">
          {theme.positionCount ?? 0}
        </Badge>
      </Link>
    </div>
  );
}
