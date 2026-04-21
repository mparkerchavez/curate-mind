import { LayersThree01 } from "@untitledui/icons";
import { GitHubIcon } from "@/components/GitHubIcon";

/**
 * MobileRedirect — full-screen block shown on viewports below 1024px.
 *
 * Curate Mind's position + evidence views depend on horizontal space
 * (two columns plus a sidebar, at minimum), and responsive stacking
 * would compromise the experience enough to feel half-finished. Rather
 * than ship a weaker mobile layout, the site asks small-screen
 * visitors to come back on desktop.
 *
 * Intentionally minimal: logo, a short explanation, one link to the
 * GitHub repo for anyone who wants to poke around from their phone.
 */

const GITHUB_URL = "https://github.com/mparkerchavez/curate-mind";

export function MobileRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-brand-solid text-white shadow-xs-skeuomorphic">
        <LayersThree01 className="size-6" />
      </div>
      <h1 className="mt-6 text-xl font-semibold tracking-[-0.01em] text-slate-950">
        Curate Mind
      </h1>
      <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">
        This experience is designed for desktop. Please visit on a larger
        screen to explore the full research base.
      </p>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <GitHubIcon className="size-4" />
        View on GitHub
      </a>
    </div>
  );
}
