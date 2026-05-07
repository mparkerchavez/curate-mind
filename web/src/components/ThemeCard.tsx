import { ArrowRight } from "@untitledui/icons";
import { formatDateLabel, summarizeText } from "@/lib/workspace-utils";

/**
 * ThemeCard — a single clickable card in the home page themes grid.
 *
 * Extracted from inline JSX in LandingPage so the grid can be rendered
 * with a consistent component. Adds a per-card freshness line showing
 * how recently the theme's positions were updated.
 */

type ThemeCardProps = {
  theme: {
    _id: string;
    title: string;
    description?: string;
    positionCount?: number;
  };
  /** Most recent position-version date within this theme, if known. */
  lastUpdatedDate?: string;
  onOpen: () => void;
};

export function ThemeCard({ theme, lastUpdatedDate, onOpen }: ThemeCardProps) {
  const positionCount = theme.positionCount ?? 0;
  const freshness = lastUpdatedDate
    ? `${positionCount} positions · updated ${formatDateLabel(lastUpdatedDate)}`
    : `${positionCount} positions`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-secondary bg-secondary text-left transition hover:-translate-y-0.5 hover:border-brand hover:bg-secondary_hover hover:shadow-skeuomorphic"
    >
      {/* Card header — matches evidence card header hierarchy */}
      <div className="px-5 pt-5 pb-4">
        <p className="text-xl font-semibold leading-7 tracking-[-0.01em] text-primary">
          {theme.title}
        </p>
        <p className="mt-2 text-sm leading-7 text-tertiary">
          {summarizeText(theme.description ?? "", 140)}
        </p>
        <p className="mt-3 text-xs leading-5 text-quaternary">{freshness}</p>
      </div>
      {/* Card footer — quiet action link */}
      <div className="border-t border-tertiary bg-primary/60 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-secondary">
          Explore
          <ArrowRight className="size-4 transition group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}
