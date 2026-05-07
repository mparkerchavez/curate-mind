/**
 * Home page content constants.
 *
 * One place for the pieces of the landing experience that are otherwise
 * tempted to drift: the GitHub link that shows up in five different
 * components, the flagship position the live demo renders, and the
 * example prompts below the hero Ask input.
 */

/** Public GitHub repo. Used by the top-bar icon, the open source
 *  section, the methodology page, the footer, and the mobile redirect. */
export const GITHUB_URL = "https://github.com/mparkerchavez/curate-mind";

/** Direct link to the setup guide on GitHub. Surfaced in the footer so
 *  builders landing on any internal page have a one-click path to the
 *  "how do I run this myself" docs without bouncing through the repo root. */
export const SETUP_GUIDE_URL = `${GITHUB_URL}/blob/main/docs/setup-guide.md`;

/** The Research Position rendered in the live Position demo on both
 *  the home page and the methodology page.
 *
 *  Currently: "Complex tasks yield greater AI speedups but lower
 *  success rates" under the AI Productivity & Workforce Impact theme.
 *  Chosen for its balance of supporting + counter evidence, concrete
 *  numbers, and active (not emerging) confidence.
 */
export const FLAGSHIP_POSITION_ID = "k579zx6bwf562fnv8v7mbjd8jh83cc85";

/** Example prompts beneath the hero Ask input. Clicking a chip prefills
 *  the input (no auto-submit). Chosen to each produce a well-cited
 *  answer that draws from multiple sources in the corpus. */
export const EXAMPLE_PROMPTS: string[] = [
  "What does the evidence say about AI adoption in the enterprise?",
  "What differentiates companies succeeding with AI from those stalling?",
  "How is AI changing software development?",
  "Where do agentic workflows actually break down?",
  "Is software engineering a preview of AI's impact on white-collar work?",
];
