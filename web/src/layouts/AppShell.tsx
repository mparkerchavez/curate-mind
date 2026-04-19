import { type ReactNode, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, LayersThree01, SearchLg } from "@untitledui/icons";
import EvidencePanel from "@/components/EvidencePanel";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";

const EVIDENCE_PANEL_WIDTH = 440;

export default function AppShell({ children }: { children: ReactNode }) {
  const {
    themes,
    activeTheme,
    positionDetail,
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

  const hasEvidence = evidenceSections.length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Header — logo, breadcrumb, theme switcher, ask input */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 lg:px-5">
        <div className="flex items-center gap-3">
          {/* Logo + home link */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic">
              <LayersThree01 className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-[-0.02em] text-slate-950">
              Curate Mind
            </span>
          </Link>

          {/* Breadcrumb */}
          <Breadcrumb
            routeKind={routeKind}
            activeTheme={activeTheme}
            positionDetail={positionDetail}
            sourceDetail={sourceDetail}
            themes={themes}
            navigate={navigate}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Compact ask input */}
          <AskInput
            value={input}
            onChange={setInput}
            onSubmit={() => {
              if (routeKind !== "ask") navigate("/ask");
              void handleAskQuestion();
            }}
            disabled={pending || reachedTurnLimit}
          />
        </div>
      </header>

      {/* Body — main content + optional evidence panel */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Evidence panel — right side, desktop only, visible when there's evidence.
            Fixed pixel width via CSS custom property, matching UUI's sidebar pattern. */}
        {hasEvidence && (
          <aside
            style={{ "--width": `${EVIDENCE_PANEL_WIDTH}px` } as React.CSSProperties}
            className="hidden shrink-0 overflow-hidden border-l border-slate-200 bg-white lg:block lg:w-(--width)"
          >
            <EvidencePanel />
          </aside>
        )}
      </div>
    </div>
  );
}

/* ── Breadcrumb ── */

type BreadcrumbProps = {
  routeKind: string;
  activeTheme: any | null;
  positionDetail: any | undefined;
  sourceDetail: any | undefined;
  themes: any[] | undefined;
  navigate: (path: string) => void;
};

function Breadcrumb({ routeKind, activeTheme, positionDetail, sourceDetail, themes, navigate }: BreadcrumbProps) {
  if (routeKind === "home") return null;

  const segments: { label: string; href?: string; dropdown?: any[] }[] = [];

  if (routeKind === "ask") {
    segments.push({ label: "Ask" });
  } else if (routeKind === "source") {
    segments.push({ label: sourceDetail?.source?.title ?? "Source" });
  } else {
    // Theme segment — always present on theme/position routes, with dropdown
    if (activeTheme) {
      const isTerminal = routeKind === "theme";
      segments.push({
        label: activeTheme.title,
        href: isTerminal ? undefined : `/themes/${activeTheme._id}`,
        dropdown: themes,
      });
    }

    // Position segment — on position routes
    if (routeKind === "position" && positionDetail) {
      segments.push({ label: positionDetail.title });
    }
  }

  return (
    <nav className="flex min-w-0 items-center gap-1.5" aria-label="Breadcrumb">
      {segments.map((seg, idx) => (
        <div key={idx} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-4 shrink-0 text-slate-400" />
          {seg.dropdown ? (
            <ThemeDropdown
              themes={seg.dropdown}
              currentThemeId={activeTheme?._id}
              label={seg.label}
              href={seg.href}
              navigate={navigate}
            />
          ) : seg.href ? (
            <Link
              to={seg.href}
              className="truncate text-sm text-slate-600 hover:text-slate-900"
            >
              {seg.label}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-slate-900">
              {seg.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}

/* ── Theme dropdown (in breadcrumb) ── */

type ThemeDropdownProps = {
  themes: any[];
  currentThemeId: string | undefined;
  label: string;
  href: string | undefined;
  navigate: (path: string) => void;
};

function ThemeDropdown({ themes, currentThemeId, label, href, navigate }: ThemeDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const sortedThemes = [...(themes ?? [])].sort((a: any, b: any) => {
    const diff = (b.positionCount ?? 0) - (a.positionCount ?? 0);
    return diff !== 0 ? diff : String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });

  return (
    <div ref={containerRef} className="relative overflow-visible">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-sm transition hover:bg-slate-100",
          href ? "text-slate-600 hover:text-slate-900" : "font-medium text-slate-900",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-slate-400 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="max-h-80 overflow-y-auto py-1">
            {sortedThemes.map((theme: any) => (
              <button
                key={theme._id}
                type="button"
                onClick={() => {
                  navigate(`/themes/${theme._id}`);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50",
                  String(theme._id) === String(currentThemeId)
                    ? "bg-utility-brand-50 text-utility-brand-700"
                    : "text-slate-700",
                )}
              >
                <span className="flex-1 truncate leading-5">{theme.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {theme.positionCount ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
      className="flex w-56 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition focus-within:border-utility-brand-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-utility-brand-100 lg:w-72"
    >
      <SearchLg className="size-4 shrink-0 text-slate-400" />
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
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
      />
      {value.trim() && (
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded p-0.5 text-utility-brand-600 transition hover:text-utility-brand-800 disabled:opacity-40"
        >
          <ArrowRight className="size-4" />
        </button>
      )}
    </form>
  );
}
