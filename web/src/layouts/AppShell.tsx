import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, LayersThree01 } from "@untitledui/icons";
import EvidencePanel from "@/components/EvidencePanel";
import { GitHubIcon } from "@/components/GitHubIcon";
import ThemeRail from "@/components/ThemeRail";
import { GITHUB_URL } from "@/config/homepage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/cn";

export default function AppShell({ children }: { children: ReactNode }) {
  const {
    sourceDetail,
    activeTheme,
    routeKind,
    evidenceSections,
  } = useWorkspace();
  const { pathname } = useLocation();

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
      {/* Header — logo, breadcrumb, primary nav */}
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

          {/* Breadcrumb — on ask, source, position. Suppressed on home and the
              themes index (top-level pages where the logo on the left is the
              implicit "home"). */}
          <Breadcrumb
            routeKind={routeKind}
            sourceDetail={sourceDetail}
            activeTheme={activeTheme}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Unified nav — same on every page. The compact ask input that
              previously lived here on non-home routes was a duplicate of the
              one on the Ask page itself; the Ask nav link replaces it. */}
          <PrimaryNav pathname={pathname} />
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
 * Shown on ask, source, and position routes. Suppressed on home and the
 * themes index — top-level pages where the logo is the implicit anchor.
 * On position routes the crumb reads "Themes > {Theme name}", with Themes
 * linking back to /themes; the position title itself is already the H1.
 */

type BreadcrumbProps = {
  routeKind: string;
  sourceDetail: any | undefined;
  activeTheme: any | undefined;
};

function Breadcrumb({ routeKind, sourceDetail, activeTheme }: BreadcrumbProps) {
  if (routeKind === "ask") {
    return <SingleCrumb label="Ask" />;
  }
  if (routeKind === "source") {
    return <SingleCrumb label={sourceDetail?.source?.title ?? "Source"} />;
  }
  if (routeKind === "position" || routeKind === "theme") {
    const themeName = activeTheme?.title;
    return (
      <nav className="flex min-w-0 items-center gap-1.5" aria-label="Breadcrumb">
        <ChevronRight className="size-4 shrink-0 text-quaternary" />
        <Link
          to="/themes"
          className="shrink-0 text-sm font-medium text-secondary transition hover:text-primary"
        >
          Themes
        </Link>
        {themeName && (
          <>
            <ChevronRight className="size-4 shrink-0 text-quaternary" />
            <span className="truncate text-sm font-medium text-primary">
              {themeName}
            </span>
          </>
        )}
      </nav>
    );
  }
  return null;
}

function SingleCrumb({ label }: { label: string }) {
  return (
    <nav className="flex min-w-0 items-center gap-1.5" aria-label="Breadcrumb">
      <ChevronRight className="size-4 shrink-0 text-quaternary" />
      <span className="truncate text-sm font-medium text-primary">{label}</span>
    </nav>
  );
}

/* ── Primary nav ──
 * Same nav on every page. Active styling lights up the section the user is
 * inside. Themes is active for both /themes and /themes/:themeId/positions/...
 * since position pages live under the themes hierarchy.
 */

function PrimaryNav({ pathname }: { pathname: string }) {
  const isThemesActive = pathname.startsWith("/themes");
  const isAskActive = pathname === "/ask";
  const isMethodologyActive = pathname === "/methodology";

  return (
    <nav className="flex items-center gap-7">
      <NavItem to="/themes" isActive={isThemesActive}>
        Themes
      </NavItem>
      <NavItem to="/ask" isActive={isAskActive}>
        Ask
      </NavItem>
      <NavItem to="/methodology" isActive={isMethodologyActive}>
        Methodology
      </NavItem>
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
  );
}

function NavItem({
  to,
  isActive,
  children,
}: {
  to: string;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "text-sm font-medium transition",
        isActive ? "text-primary" : "text-secondary hover:text-primary",
      )}
    >
      {children}
    </Link>
  );
}

