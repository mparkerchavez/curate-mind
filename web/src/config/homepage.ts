/**
 * Home page content constants.
 *
 * One place for the pieces of the landing experience that are otherwise
 * tempted to drift: the GitHub link that shows up in five different
 * components and the flagship position the live demo renders.
 */

/** Public GitHub repo. Used by the top-bar icon, the open source
 *  section, the methodology page, the footer, and the mobile redirect. */
export const GITHUB_URL = "https://github.com/mparkerchavez/curate-mind";

/** Direct link to the setup guide on GitHub. Surfaced in the footer so
 *  builders landing on any internal page have a one-click path to the
 *  "how do I run this myself" docs without bouncing through the repo root. */
export const SETUP_GUIDE_URL = `${GITHUB_URL}/blob/main/docs/setup-guide.md`;

/** The Research Position rendered in the live Position demo on both
 *  the home page and the methodology page. Chosen for its balance of
 *  supporting and counter evidence, concrete numbers, and active
 *  confidence.
 */
export const FLAGSHIP_POSITION_ID = "k579zx6bwf562fnv8v7mbjd8jh83cc85";
