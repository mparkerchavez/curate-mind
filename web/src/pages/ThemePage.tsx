import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { comparePositionsByFreshness } from "@/lib/workspace-utils";

/**
 * Theme entry route. Redirects to the theme's first position so the
 * middle column always shows a stance instead of a blank framing page.
 * Rail sort order matches comparePositionsByFreshness, so "first" stays
 * consistent with what the user sees on the left.
 */
export default function ThemePage() {
  const { activeTheme, themePositions } = useWorkspace();

  const sortedPositions = useMemo(
    () => [...(themePositions ?? [])].sort(comparePositionsByFreshness),
    [themePositions],
  );

  if (!activeTheme || themePositions === undefined) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading theme" />
      </div>
    );
  }

  const firstPosition = sortedPositions[0];
  if (firstPosition) {
    return (
      <Navigate
        to={`/themes/${activeTheme._id}/positions/${firstPosition._id}`}
        replace
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
        Theme
      </p>

      <h1 className="mt-3 text-display-sm font-semibold tracking-[-0.02em] text-primary 2xl:text-display-md">
        {activeTheme.title}
      </h1>

      {activeTheme.description && (
        <p className="mt-4 text-base leading-7 text-tertiary">
          {activeTheme.description}
        </p>
      )}

      <p className="mt-10 text-sm leading-6 text-tertiary">
        No positions have been published under this theme yet.
      </p>
    </div>
  );
}
