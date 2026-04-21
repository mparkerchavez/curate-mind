import { LayersThree01 } from "@untitledui/icons";
import { GitHubIcon } from "@/components/GitHubIcon";

/**
 * MobileRedirect — full-screen block shown on viewports below 1024px.
 *
 * Hierarchy is explicit: the primary message is "come back on desktop"
 * (the actual ask of this page). A secondary section below it offers
 * the GitHub repo as a different destination — not a lite version of
 * the site, but the code, methodology, and MCP server for anyone
 * curious about how the system itself is built.
 */

const GITHUB_URL = "https://github.com/mparkerchavez/curate-mind";

export function MobileRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 text-center">
      {/* Primary: come back on desktop */}
      <div className="flex flex-col items-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-brand-solid text-white shadow-xs-skeuomorphic">
          <LayersThree01 className="size-6" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.01em] text-slate-950">
          Come back on desktop.
        </h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">
          Curate Mind's research views need horizontal space. Open this on
          a laptop or desktop to explore the curated research, ask questions,
          and trace every claim back to its source.
        </p>
      </div>

      {/* Subtle divider */}
      <div
        aria-hidden="true"
        className="mt-12 h-px w-16 bg-slate-200"
      />

      {/* Secondary: a different destination, not a lite version */}
      <div className="mt-8 flex flex-col items-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Want to see how it's built?
        </p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
          Curate Mind is open source. The repo has the code, the MCP server,
          and the full methodology. Fork it and build your own research base
          on a different topic.
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-slate-300 hover:text-slate-900"
        >
          <GitHubIcon className="size-4" />
          View on GitHub
        </a>
      </div>
    </div>
  );
}
