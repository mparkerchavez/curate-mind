import { ArrowRight } from "@untitledui/icons";
import { Link } from "react-router-dom";
import { Button } from "@/components/base/buttons/button";
import { GitHubIcon } from "@/components/GitHubIcon";
import { GITHUB_URL } from "@/config/homepage";

/**
 * OpenSourceSection — the "fork the whole system" beat near the bottom
 * of the home page. Coda, not a primary pitch: portfolio-first visitors
 * ignore it; builders who get this far find an invitation to take the
 * system for themselves.
 *
 * Uses UUI's bg-brand-section (dark neutral) and section text tokens
 * so it pairs cohesively with the footer to form a single bottom zone
 * in both light and dark mode.
 */

export function OpenSourceSection() {
  return (
    <section
      aria-label="Open source"
      className="relative overflow-hidden border-t border-secondary bg-brand-section"
    >
      <div className="absolute inset-x-8 top-0 bottom-0 border-x border-white/10 opacity-70" aria-hidden="true" />
      <div className="cm-grid-surface absolute inset-x-8 top-0 h-full opacity-40" aria-hidden="true" />
      <div className="cm-coda-vignette absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto max-w-3xl px-6 py-16 text-center lg:px-8 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-primary_on-section">
          Fork the whole system. Build your own.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-secondary_on-section">
          Curate Mind is open source. The front end you just used is one
          piece of it. The full system includes everything needed to curate
          your own research base, on any topic you care about.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <Button
            size="md"
            color="primary"
            iconLeading={GitHubIcon}
            iconTrailing={ArrowRight}
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on GitHub
          </Button>
          <Link
            to="/methodology"
            className="text-sm font-medium text-tertiary_on-section transition hover:text-primary_on-section"
          >
            Read the methodology
          </Link>
        </div>
      </div>
    </section>
  );
}
