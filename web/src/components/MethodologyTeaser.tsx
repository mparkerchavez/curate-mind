import { ArrowRight } from "@untitledui/icons";
import { Link } from "react-router-dom";

/**
 * MethodologyTeaser — small, quiet section sandwiched between the live
 * Position demo and the themes grid on the home page.
 *
 * By the time a visitor hits this beat, they have seen the method in
 * action (stance + evidence + traceability inside the demo). The job
 * here is not to explain the method; it is to offer a path for anyone
 * who wants to understand it more deeply, on its own dedicated page.
 *
 * Visual weight is intentionally lower than flanking sections.
 */
export function MethodologyTeaser() {
  return (
    <section
      aria-label="Methodology teaser"
      className="py-4 text-center"
    >
      <p className="text-sm text-tertiary">
        Wondering how positions, evidence, and lineage fit together?
      </p>
      <Link
        to="/methodology"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary transition hover:text-brand-primary"
      >
        Read the methodology
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
