import { ArrowRight } from "@untitledui/icons";
import { Link } from "react-router-dom";
import { Button } from "@/components/base/buttons/button";
import { GitHubIcon } from "@/components/GitHubIcon";

/**
 * OpenSourceSection — the "fork the whole system" beat near the bottom
 * of the home page. Coda, not a primary pitch: portfolio-first visitors
 * ignore it; builders who get this far find an invitation to take the
 * system for themselves.
 *
 * Sits on a subtle gray background with a top border so it feels like
 * a distinct section, not another content row.
 */

const GITHUB_URL = "https://github.com/mparkerchavez/curate-mind";

export function OpenSourceSection() {
  return (
    <section
      aria-label="Open source"
      className="border-t border-slate-200 bg-slate-50"
    >
      <div className="mx-auto max-w-3xl px-6 py-16 text-center lg:px-8 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-slate-950">
          Fork the whole system. Build your own.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
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
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Read the methodology
          </Link>
        </div>
      </div>
    </section>
  );
}
