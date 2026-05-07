/**
 * This file is retained for reference but is no longer used.
 * Supadata (supadata.ts) replaced Jina for URL fetching and
 * YouTube transcripts.
 *
 * Jina URL fetching for Curate Mind.
 *
 * Fetches a public URL through Jina's reader API and returns
 * clean markdown content, stripped of navigation and ads.
 */

export { getWeekFolderPath, sanitizeFilename } from "./utils.js";

export async function fetchUrlViaJina(url: string): Promise<string> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "JINA_API_KEY environment variable is not set. " +
        "Set it in your Claude Desktop MCP config or in .env.local"
    );
  }

  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Accept: "text/markdown",
      Authorization: `Bearer ${apiKey}`,
      "X-Return-Format": "markdown",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Jina fetch failed (${response.status}): ${body.slice(0, 200)}`
    );
  }

  return await response.text();
}
