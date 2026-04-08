# Curate Mind — Web Frontend

A React + Vite + Tailwind explorer for the Curate Mind Convex backend. Two experiences: a research browser that traces positions down to verbatim source quotes, and a grounded chat interface that answers questions strictly from the curated corpus.

## Run locally

```bash
cd web
npm install
echo 'VITE_CONVEX_URL=https://your-deployment.convex.cloud' > .env.local
npm run dev
```

The app boots at http://localhost:5173.

If you have multiple projects in the Convex deployment, set `VITE_CURATE_MIND_PROJECT_ID` to lock the app to one. Otherwise it picks the first project from `api.projects.listProjects`.

## Run on Replit

1. Import this `web/` folder as a Replit project.
2. Add a Replit Secret named `VITE_CONVEX_URL` with your Convex deployment URL.
3. (Optional) Add `VITE_CURATE_MIND_PROJECT_ID` if you want to pin the project.
4. Click Run. The included `.replit` file uses `npm run dev`.

The Anthropic and OpenAI keys live in the Convex environment, **not** Replit. Set them with:

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
npx convex env set OPENAI_API_KEY    sk-...
```

(`OPENAI_API_KEY` is likely already set — it's used by the existing search action.)

## Backend addition

A new Convex action lives at `convex/chat.ts` (`api.chat.askGrounded`). It embeds the question, vector-searches the top 12 data points, hydrates source metadata, fetches the current Research Lens, builds a system prompt, and calls Claude Sonnet 4.6 with the conversation history. It returns:

```ts
{
  answer: string;
  citedDataPointIds: string[];
  retrievedDataPoints: { _id, claimText, anchorQuote, evidenceType, confidence, source: {...} }[];
}
```

After deploying it once with `npx convex dev` or `npx convex deploy`, the generated `convex/_generated/api.d.ts` will include `api.chat.askGrounded`, which the frontend already imports.

## Convex queries / actions used

| Where | Function | Type |
| --- | --- | --- |
| HomePage | `api.projects.listProjects` | query |
| HomePage | `api.positions.getThemes` | query |
| HomePage | `api.positions.listAllPositions` | query |
| BrowsePage / ThemeGrid | `api.positions.getThemes` | query |
| ThemePage | `api.positions.getThemes` | query |
| ThemePage / PositionList | `api.positions.getPositionsByTheme` | query |
| PositionPage / LineageView | `api.positions.getPositionDetail` | query |
| ChatInterface | `api.chat.askGrounded` | **action (new)** |

## Design notes

- **Light editorial palette**: warm paper background, deep ink, single ochre accent. Fraunces (display + pull quotes), IBM Plex Sans (body), JetBrains Mono (labels).
- **Pull-quote anchors**: `.pullquote` styles every verbatim quote as a left-bordered block with an oversized opening quote — they should feel like evidence, not footnotes.
- **Lineage spine**: a thin vertical rule on `LineageView` links the position header → supporting evidence → counter-evidence visually.
- **Subtle status colors**: ochre/sage/ink with low-saturation borders, never traffic-light.

## Data model assumptions to verify

The frontend assumes:

- `getPositionDetail` returns `currentVersion.supportingEvidenceDetails` and `counterEvidenceDetails` with `_id`, `claimText`, `anchorQuote`, `evidenceType`, `confidence`, `extractionNote`, and either a `source` object or denormalized `sourceTitle` / `sourceTier`. The current `convex/positions.ts` returns the denormalized form — `DataPointCard` falls back to it.
- `getDataPoint` (used by the chat action's hydration) returns a `source` object with `_id`, `title`, `authorName`, `publisherName`, `canonicalUrl`, `publishedDate`, `tier`. This matches the current `convex/dataPoints.ts`.
- `getCurrentLens` returns `currentPositions`, `openQuestions`, `surpriseSignals`. Matches `convex/researchLens.ts`.
- The chat action expects `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the Convex environment.

If any of those don't match the live data, the components will degrade gracefully (skeletons, "source unavailable", etc.) rather than crash, but the lineage visuals will be thinner than intended.
