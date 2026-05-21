# Curate Mind Convex Backend

This directory contains the Convex schema, queries, mutations, and actions that store the Curate Mind research foundation.

The backend is append-only by design: sources, data points, curator observations, mental models, tags, and research position versions are preserved so extraction mistakes can be corrected without deleting historical records.

## Local Development

From the repo root, run:

```bash
npx convex dev
```

This creates or connects a Convex deployment, pushes `convex/schema.ts`, and watches backend files for changes.

## Key Areas

- `schema.ts` defines the persistent research entities and project customization fields.
- `projects.ts` and `userPreferences.ts` store project profile and writing preference customization.
- `sources.ts`, `dataPoints.ts`, `observations.ts`, `mentalModels.ts`, and `positions.ts` power the extraction workflow.
- `chat.ts` and `search.ts` support the public demo and cited/exploratory query flows.
