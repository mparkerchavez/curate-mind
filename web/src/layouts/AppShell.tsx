import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, LayersThree01, SearchLg } from "@untitledui/icons";
import EvidencePanel from "@/components/EvidencePanel";
import { GitHubIcon } from "@/components/GitHubIcon";
import ThemeRail from "@/components/ThemeRail";
import { GITHUB_URL } from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function AppShell({ children }: { children: ReactNode }) {
  const {
    sourceDetail,
    routeKind,
    navigate,
    input,
    setInput,
    handleAskQuestion,
    pending,
    reachedTurnLimit,
    evidenceSections,
  } = useWorkspace();

  // The evidence panel only belongs on routes that inherently have
  // evidence to show: the conversation (ask), a research position, or
  // a source page. On home, methodology, and theme index routes,
  // suppress the panel even if activeAnswer or another state has
  // leaked in from a previous navigation.
  const isEvidenceRoute =
    routeKind === "ask" ||
    routeKind === "position" ||
    routeKind === "source";
  const hasEvidence = isEvidenceRoute && evidenceSections.length > 0;

  // The theme rail lives on theme + position routes. It sits as a sibling
  // of <main> so it stays visually pinned without `position: sticky`.
  const showThemeRail = routeKind === "theme" || routeKind === "position";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-secondary">
      {/* Header — logo, breadcrumb, theme switcher, ask input */}
      <header className="shrink-0 border-b border-secondary bg-primary px-4 py-2.5 lg:px-5">
        <div className="flex items-center gap-3">
          {/* Logo + home link */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-solid text-primary_on-brand shadow-xs-skeuomorphic">
              <LayersThree01 className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-[-0.02em] text-primary">
              Curate Mind
            </span>
          </Link>

          {/* Breadcrumb — only on ask/source; theme and position rely on the rail + H1. */}
          <Breadcrumb routeKind={routeKind} sourceDetail={sourceDetail} />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side of header:
              - On home: Methodology link + GitHub link (both text)
              - On every other route: compact Ask input */}
          {routeKind === "home" ? (
            <nav className="flex items-center gap-7">
              <Link
                to="/methodology"
                className="text-sm font-medium text-secondary transition hover:text-primary"
              >
                Methodology
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary transition hover:text-primary"
              >
                <GitHubIcon className="size-4" />
                GitHub
              </a>
            </nav>
          ) : (
            <AskInput
              value={input}
              onChange={setInput}
              onSubmit={() => {
                if (routeKind !== "ask") navigate("/ask");
                void handleAskQuestion();
              }}
              disabled={pending || reachedTurnLimit}
            />
          )}
        </div>
      </header>

      {/* Body — optional left rail + main content + optional evidence panel */}
      <div className="flex min-h-0 flex-1">
        {showThemeRail && <ThemeRail />}

        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Evidence panel — right side, desktop only, visible when there's evidence.
            Narrower on small laptops (≥1024) and bumps up at ≥1440. */}
        {hasEvidence && (
          <aside className="hidden shrink-0 overflow-hidden border-l border-secondary bg-primary lg:block lg:w-[400px] 2xl:w-[440px]">
            <EvidencePanel />
          </aside>
        )}
      </div>
    </div>
  );
}

/* ── Breadcrumb ──
 * Suppressed on home (where it never appeared) and on theme/position routes
 * (where the left rail now carries theme context and the page H1 carries the
 * position title — the breadcrumb would just repeat them). Still shown on
 * ask and source routes where the top bar is the only place the scope shows.
 */

type BreadcrumbProps = {
  routeKind: string;
  sourceDetail: any | undefined;
};

function Breadcrumb({ routeKind, sourceDetail }: BreadcrumbProps) {
  if (routeKind === "home" || routeKind === "theme" || routeKind === "position") {
    return null;
  }

  let label: string;
  if (routeKind === "ask") {
    label = "Ask";
  } else if (routeKind === "source") {
    label = sourceDetail?.source?.title ?? "Source";
  } else {
    return null;
  }

  return (
    <nav className="flex min-w-0 items-center gap-1.5" aria-label="Breadcrumb">
      <ChevronRight className="size-4 shrink-0 text-quaternary" />
      <span className="truncate text-sm font-medium text-primary">{label}</span>
    </nav>
  );
}

/* ── Ask input ── */

type AskInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
};

function AskInput({ value, onChange, onSubmit, disabled }: AskInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
      className="flex w-56 items-center gap-2 rounded-lg border border-secondary bg-secondary px-2.5 py-1.5 transition focus-within:border-brand focus-within:bg-primary focus-within:ring-2 focus-within:ring-brand lg:w-72"
    >
      <SearchLg className="size-4 shrink-0 text-quaternary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!disabled && value.trim()) onSubmit();
          }
        }}
        disabled={disabled}
        placeholder="Ask the research base..."
        className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-placeholder"
      />
      {value.trim() && (
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded p-0.5 text-brand-secondary transition hover:text-brand-primary disabled:opacity-40"
        >
          <ArrowRight className="size-4" />
        </button>
      )}
    </form>
  );
}

