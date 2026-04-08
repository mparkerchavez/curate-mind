import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!url) {
  // Surface a clear error in the console rather than a cryptic Convex one.
  // eslint-disable-next-line no-console
  console.error(
    "VITE_CONVEX_URL is not set. Add it to Replit Secrets (or .env.local for local dev)."
  );
}

export const convex = new ConvexReactClient(url ?? "https://missing.convex.cloud");

export const ENV_PROJECT_ID = import.meta.env.VITE_CURATE_MIND_PROJECT_ID as
  | string
  | undefined;
