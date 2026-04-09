# Curate Mind — Web Frontend

A React + Vite + Tailwind 4 explorer for the Curate Mind Convex backend. The UI now runs as a single three-column workspace: the main reading pane, a persistent evidence pane, and a context-aware chat pane that writes answers back into the main canvas.

## Run locally

```bash
cd web
npm install
echo 'VITE_CONVEX_URL=https://your-deployment.convex.cloud' > .env.local
npm run dev
```

The app boots at http://localhost:5000.

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
| SourcePage | `api.sources.getSourceDetail` | query |
| ChatInterface | `api.chat.askGrounded` | **action (new)** |

## Source link maintenance

The evidence cards prefer source destinations in this order:

1. Convex file storage URL
2. External canonical URL
3. Internal `/sources/:sourceId` record page

To audit or backfill missing canonical URLs from the local `sources/` library:

```bash
cd mcp
npm install
npm run source-links:audit
npm run source-links:apply
```

## Design notes

- **Three-column workspace**: the main pane is the reading canvas, the middle pane is always evidence, and the right pane is always chat.
- **Progressive disclosure**: browsing and asking share the same evidence behavior. Citation chips in answers jump to evidence cards in the middle pane.
- **Evidence-first cards**: each data point card is ordered around interpretation, verbatim quote, source access, and curator note; secondary metadata is collapsed.
- **Tailwind 4 + Untitled UI foundation**: the app uses the Tailwind Vite plugin, CSS theme tokens, and Untitled UI icons/packages instead of the old Tailwind 3 config.

## Data model assumptions to verify

The frontend assumes:

- `getPositionDetail` returns `currentVersion.supportingEvidenceDetails` and `counterEvidenceDetails` with `_id`, `claimText`, `anchorQuote`, `evidenceType`, `confidence`, `extractionNote`, and a `source` object that includes `resolvedUrl`, `resolvedLinkKind`, `sourcePagePath`, and optional `storageUrl`.
- `getDataPoint` (used by the chat action's hydration) returns the same resolved source object shape.
- `getSourceDetail` returns `source`, `dataPoints`, `dataPointCount`, `sourceSynthesis`, `urlAccessibility`, and `status`.
- `getCurrentLens` returns `currentPositions`, `openQuestions`, `surpriseSignals`. Matches `convex/researchLens.ts`.
- The chat action expects `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in the Convex environment.

If any of those don't match the live data, the components will degrade gracefully (skeletons, "source unavailable", etc.) rather than crash, but the lineage visuals will be thinner than intended.
