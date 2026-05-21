# Customization Design Proposal — Open-Source Portability for Curate Mind

**Date:** 2026-05-20
**Status:** Proposal. Awaiting review before implementation begins.
**Covers:** Tasks 2.1 (review prompt surfaces and separate locked vs customizable) and 2.3 (design the user customization experience).
**Companion task:** Task 2.2 (skill prompt rewrites) reads this proposal as its specification. See Section 16 for the updated Task 2.2 scope.

---

## 1. Executive summary

Curate Mind today bakes one user's identity, domain, and style into every prompt surface: extraction skills assume artificial intelligence strategy research, the chat prompt hardcodes a particular voice, and the web app's suggested questions reference one specific corpus. To open-source the system as a portfolio piece that strangers can clone and use for their own research, we need to lift the customizable surface out of the code and put it behind a small Convex schema, an MCP tool set, and a library of copy-paste setup prompts.

This proposal does three things:

1. Defines a three-layer customization model: **Locked System Behavior** (Curate Mind's method, never editable), **Project Profile** (per-project facts about what is being researched and for whom), **User Style** (how the assistant should write, applied to every project on the instance).
2. Renames the extraction pipeline and the response shape so they read as descriptive English instead of numbered passes and layers. The structural workflow is unchanged. Only the user-facing language and one stage's configurability change.
3. Specifies the MCP tool surface, the onboarding interview script, the documentation updates, and the copy-paste prompt library that together replace the idea of a web settings page. Customization happens through a conversation with the user's own AI assistant.

No web settings interface is built in this version. No new personas are introduced. The method itself stays exactly as it is.

---

## 2. Table of contents

- Part A — Architecture decisions (Sections 3 to 6)
- Part B — Implementation surface (Sections 7 to 10)
- Part C — User-facing deliverables (Sections 11 to 12)
- Part D — Loose ends and follow-ups (Sections 13 to 16)

---

# Part A — Architecture decisions

## 3. The three customization layers

| Layer | Scope | Where it lives | Who can edit it | Examples |
|---|---|---|---|---|
| **Locked System Behavior** | Curate Mind's method | Source code: `convex/chat.ts` prompt blocks marked `// Locked because...`, `convex/schema.ts` core tables, the four extraction stages, the citation contract | No one. Read-only via the preview tool. | Citation labels and the trailing JSON contract, the explore vs cite-and-trace query protocol, the append-only invariant, the three-band response shape, the anti-speculation rules |
| **Project Profile** | One specific research project on the instance | New columns on the `projects` table | The curator, through MCP tools or skill-mediated chat | Project name and description, domain, audience, time horizon, vocabulary, persona name, suggested prompts shown on the web hero, secondary-capture configuration, theme hints |
| **User Style** | Instance-wide preferences applied to every project | New `userPreferences` singleton table (one row, no `projectId`) | The curator, through MCP tools | Voice (analytical, conversational, formal), structure preference (prose, bullets, mixed), banned punctuation and phrases, hedging style, language, free-text style notes |

User Style is intentionally instance-wide, not per-project, because in a single-user local install the person's writing preferences travel with them across all their projects. If anyone later needs per-project overrides, a `styleOverrides` field can be added to the project profile without breaking the singleton model.

The current `projects` table in [convex/schema.ts](convex/schema.ts) has only `name`, `description`, and `createdDate`. It needs to grow into a real profile. Section 7 specifies the full schema.

## 4. Renamed pipeline and weekly workflow

Source processing today is described in three overlapping vocabularies: four "passes" in the architecture spec, two-then-one "sub-agents" in the batch orchestrator, and three-numbered "phases" in the weekly skills. New users have no chance of following this.

The proposal: every user-facing surface uses **one** vocabulary, in descriptive English. Internal code can keep whatever names it likes.

### Source processing stages (per source)

| Old name | New name | What happens | Locked? |
|---|---|---|---|
| Pass 1 (Core Extraction) | **Extract** | Read the source, pull out atomic claims with verbatim anchor quotes, write the 2 to 3 paragraph source synthesis. No tags, no interpretation, no mental models. | Locked. Always runs. |
| Pass 2 (Mental Model Scan) | **Secondary Capture** | Re-read the source with a fresh context window and capture a configurable secondary item type. Default: mental models. | **Optional and configurable per project.** See Section 6. |
| Pass 3 (Enrichment) | **Enrich** | Load the data points from Convex, apply tags with a holistic view of the source, set confidence, write extraction notes, link related data points, finalize secondary items. Uses the Research Lens. | Locked. Always runs. |
| Pass 4 (Curator Review) | **Review** | The curator looks at flags. This is no longer described as part of the "pipeline" because it is human work, not machine work. | Locked stage of the workflow. Always available. |

### Weekly batch workflow (across many sources)

| Old name | New name | What happens |
|---|---|---|
| Phase 1 | **Batch Extract** | The batch orchestrator runs Extract, Secondary Capture (if enabled), and Enrich across all pending sources, then emits a flag report. |
| Phase 2 | **Batch Review** | The curator works through the flag report and produces a Decisions Document. |
| Phase 3 | **Batch Integrate** | The Decisions Document is executed (observations saved, positions updated), followed by tag-based evidence linking. |

> **Amendment, 2026-05-20:** The original draft of this section named the three batch chats "Weekly Extract / Weekly Review / Weekly Integrate". That language was changed to "Batch Extract / Batch Review / Batch Integrate" after review. The curator runs this workflow multiple times per week, so a cadence-implying name was misleading. The activities are unchanged.

The "deep mode" interactive single-source workflow keeps the same idea but uses the stage names: a deep extract conversation runs Extract, Secondary Capture, Enrich, and Review interactively in one chat.

### Reversal of Decision 20's sub-agent combination

Today, batch mode combines Extract and Secondary Capture (then "Pass 1 and Pass 2") into one sub-agent because the source text is already in context. The original architecture intent was a fresh context window for Secondary Capture, so that pattern recognition is not contaminated by the structured-extraction frame.

With Secondary Capture now optional, the cost of the original intent is much lower: only projects that enable Secondary Capture pay for the extra sub-agent and the extra source-text load. So this proposal restores the fresh-eyes property: **Secondary Capture runs in its own sub-agent with a clean context window**, when enabled. Decision 20 in the design decisions log gets amended accordingly.

## 5. Response shape: Stance, then Evidence, then Source

The four-layer progressive disclosure model (Themes and Positions, Evidence, Verification, Full Source) was originally an access matrix for two personas: a Reader could see Layers 1 and 2 but not 3 and 4, while the Analyst could see everything. The Reader persona was never implemented (no authentication, no enforcement in code, no API), and the web app at curatemind.io publishes Layer 3 anchor quotes through deep-link URL fragments anyway. The persona distinction has effectively collapsed into one: the curator.

Without an access matrix to enforce, "layers" is the wrong metaphor. What remains useful is the **information disclosure shape of an analyst answer**, which still moves from synthesis to evidence to provenance. The proposal collapses the four layers into three named bands.

| Old layer | New band | What it is |
|---|---|---|
| Layer 1 (Themes and Positions) | **Stance** | What Curate Mind currently thinks about the question. The synthesized answer. Position labels like `[P1]` as plain references when they help orient the answer. |
| Layer 2 (Evidence) | **Evidence** | Data points, curator observations, and secondary items that support the stance. Every claim carries an inline citation like `[E1]`. Each evidence item carries its anchor quote as metadata used to build deep-link URL fragments, but the anchor quote itself is not rendered visibly on the web frontend. |
| Layer 3 (Verification) | Folded into Evidence. | The anchor quote is a property of an evidence item, not a separate band. Verification is the deep link to the original source, not a separate disclosure layer. |
| Layer 4 (Full Source) | **Source** | Provenance metadata: title, author, publisher, date, canonical URL, deep link to the highlighted passage. The web app never serves full source text. MCP tools can fetch full text for the curator. |

The `cm_ask` response shape stays exactly as it is in code; only the language describing it changes. The web rendering already matches this shape (see `SourceEvidenceGroup` in [web/src/components/SourceEvidenceGroup.tsx](web/src/components/SourceEvidenceGroup.tsx)) so no frontend rewrite is required.

### Anchor quote handling stays as the copyright mitigation

The current frontend behavior, verified during this design session: live routes (`/ask`, `/themes/...`, `/`) use the anchor quote only to construct a text fragment URL for "Open at source" deep links. The anchor quote text never renders in the live UI. The unmounted `WorkspacePage` and the hardcoded `MethodologyPage` examples are exceptions; the second is intentional static demo content showing what extraction produces.

This proposal ratifies that behavior as the public position: **anchor quotes leave the server as deep-link metadata only, not as visible text on public routes.** Decision 13 in the design decisions log gets amended accordingly.

## 6. Secondary Capture as a customizable stage

Today, the second extraction stage always runs and always captures mental models (frameworks, analogies, named terms). For a user who runs Curate Mind on their own notes, mental models may not exist. For a user tracking investment theses, the second-most-valuable thing to capture might be decision points, not frameworks. Locking this stage to mental models forces every user into one specific cognitive shape that may not fit their work.

The proposal: Secondary Capture is configurable per project, with a simple but flexible model.

### Configuration shape

The project profile carries three fields that drive Secondary Capture:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `secondaryCaptureEnabled` | boolean | `true` | If false, the Secondary Capture stage is skipped entirely. |
| `secondaryCaptureLabel` | string | `"Mental Models"` | Short noun phrase used in user-facing surfaces (skill openings, flag reports, web evidence panels). |
| `secondaryCaptureDescription` | string | seed prompt for mental models | Free-text guidance shown to the Secondary Capture sub-agent. Tells it what to look for, how to format the output, and what to flag for review. |

A user can choose to keep the defaults (and behave exactly like Curate Mind today), turn the stage off, or write their own free-text description for a different capture type. Examples: "Capture any reference to a specific dollar amount with the company it refers to and the time period it applies to." Or: "Capture every methodology limitation the source acknowledges about its own findings." Or: "Capture proper nouns that name new products, projects, or initiatives."

### Storage

Mental models continue to live in their existing `mentalModels` table when Secondary Capture uses the default. For any other capture type (free-text description), captured items go into a new `secondaryItems` table with a generic schema. Section 7 specifies the table.

Mixed projects (some sources captured under the default, later sources captured under a custom description) are allowed. Each captured item knows which configuration produced it.

### Why this, not "fully custom secondary entity types"

A fully custom entity model would let users define their own schema fields with their own validation. That is a much larger lift: dynamic Convex schemas, custom retrieval, custom UI rendering. The free-text-description approach gets most of the flexibility for almost none of the complexity: one new table, one prompt seed, no schema gymnastics. Fully custom entity types stay in Section 15 (out of scope) for a future version.

---

# Part B — Implementation surface

## 7. Schema additions

### Extend the `projects` table

Current shape: `name`, `description`, `createdDate`.

Add the following optional fields. All optional so existing projects continue to load while the migration backfills them.

```typescript
projects: defineTable({
  // existing
  name: v.string(),
  description: v.optional(v.string()),
  createdDate: v.string(),

  // new profile fields (all optional during transition)
  domain: v.optional(v.string()),
  audience: v.optional(v.string()),
  timeHorizon: v.optional(v.string()),
  researchUnitLabel: v.optional(v.string()),    // default "research"
  ideaUnitLabel: v.optional(v.string()),        // default "position"
  assistantRoleName: v.optional(v.string()),    // default "research assistant"
  suggestedPrompts: v.optional(v.array(v.string())),

  secondaryCaptureEnabled: v.optional(v.boolean()),
  secondaryCaptureLabel: v.optional(v.string()),
  secondaryCaptureDescription: v.optional(v.string()),

  themeHints: v.optional(v.string()),
  highValueEvidenceNotes: v.optional(v.string()),
  confidenceRubricNotes: v.optional(v.string()),
  tagStrategyNotes: v.optional(v.string()),

  profileInitialized: v.optional(v.boolean()),  // false until onboarding runs
  profileVersion: v.optional(v.number()),       // bumps on every update for audit
})
```

`highValueEvidenceNotes`, `confidenceRubricNotes`, `tagStrategyNotes`, and `themeHints` are the customization placeholders that Task 2.2 will insert into the renamed skill files. They are free-text fields filled by the curator during onboarding or later.

### Create the `userPreferences` singleton

```typescript
userPreferences: defineTable({
  voice: v.optional(v.union(
    v.literal("analytical"),
    v.literal("conversational"),
    v.literal("formal"),
  )),
  structurePreference: v.optional(v.union(
    v.literal("prose"),
    v.literal("bullets"),
    v.literal("mixed"),
  )),
  bannedPunctuation: v.optional(v.array(v.string())),
  bannedPhrases: v.optional(v.array(v.string())),
  alwaysIncludeCounterEvidence: v.optional(v.boolean()),
  evidenceThinPolicy: v.optional(v.union(
    v.literal("say-so"),
    v.literal("skip"),
    v.literal("ask"),
  )),
  hedgingStyle: v.optional(v.union(
    v.literal("direct"),
    v.literal("moderate"),
    v.literal("cautious"),
  )),
  language: v.optional(v.string()),
  customStyleNotes: v.optional(v.string()),
  preferencesInitialized: v.optional(v.boolean()),
  updatedAt: v.optional(v.string()),
})
```

A getter helper enforces "one row only" semantics: if no row exists, it returns a defaulted shape; if more than one exists (defensive), it returns the most recently updated.

### Create the `secondaryItems` table (for non-default capture types)

```typescript
secondaryItems: defineTable({
  projectId: v.id("projects"),
  sourceId: v.id("sources"),
  captureLabel: v.string(),         // copied from project.secondaryCaptureLabel at capture time
  title: v.string(),                // short noun phrase
  content: v.string(),              // body of the captured item
  relatedDataPointId: v.optional(v.id("dataPoints")),
  capturedAt: v.string(),
})
  .index("by_projectId", ["projectId"])
  .index("by_sourceId", ["sourceId"])
```

When `secondaryCaptureEnabled` is true and `secondaryCaptureLabel` is `"Mental Models"`, captures still go to the existing `mentalModels` table. When the label is anything else, captures go here. This preserves the existing mental-model corpus and avoids a big migration.

## 8. MCP tool surface

Seven new tools, all stdio-compatible, all returning JSON.

| Tool | Purpose | Behavior |
|---|---|---|
| `cm_get_project_profile` | Read the full profile for a project. | Returns every profile field plus `profileInitialized`. The onboarding skill keys on the boolean. |
| `cm_update_project_profile` | Partial update of profile fields. | Validates each field. Bumps `profileVersion`. Idempotent. |
| `cm_get_user_preferences` | Read the instance-wide user style preferences. | Returns the singleton or a defaulted shape if uninitialized. |
| `cm_update_user_preferences` | Partial update of user style fields. | Validates. Sets `updatedAt`. |
| `cm_preview_prompt_profile` | Show the assembled system prompt for a given chat mode. | Returns the full prompt as a string, plus a structured list `lockedBlocks: string[]` naming the blocks the user cannot edit. Builds trust by showing the user exactly what their profile produces and what the method enforces. |
| `cm_validate_profile` | Check the profile for problems. | Returns `{ ok, warnings, errors }`. Catches: required fields blank, suggested prompts over six, banned-punctuation entries that would break citation labels, contradictions with locked rules. |
| `cm_reset_profile_to_defaults` | Restore starter defaults. | Accepts `scope: "project" | "user" | "both"`. The locked layer is never affected because it lives in code, not data. |

Two important things this surface does NOT include:

1. No tool to edit locked blocks. Locked is locked.
2. No tool to define custom secondary entity schemas. The free-text description model handles every customization case in this version.

## 9. Where each layer flows in `convex/chat.ts`

The recent prompt refactor (commit `5f59cb0`) already split the chat prompt into named composable blocks. Each block maps cleanly to one of the three layers:

| Block in [convex/chat.ts](convex/chat.ts) | Layer | Change required |
|---|---|---|
| `buildAssistantRoleBlock` | Project Profile | Read `assistantRoleName` from profile. Default kept. |
| `buildProjectContextBlock` | Project Profile | Render `domain`, `audience`, `timeHorizon`, `researchUnitLabel`. |
| `buildStyleDefaultsBlock` | User Style | Rename to `buildUserStyleBlock`. Read from `userPreferences`. Current hardcoded text becomes the seed value for a fresh singleton. |
| `buildGroundedAnswerRulesBlock` | Locked | No change. Already marked `// Locked because...`. |
| `buildAnalystLockedRulesBlock` | Locked | No change. Already marked `// Locked because...`. |
| `buildResearchLensBlock` | System artifact (locked structure, generated from positions) | No change. |
| `buildRetrievedEvidenceBlock` | Locked rendering of retrieved evidence | No change. |

The wiring change is small: `resolveProjectPromptContext` already takes a `projectId`. It needs to load the new profile fields, and the chat action needs to load `userPreferences` alongside the project context.

## 10. Onboarding interview script

This script runs the first time the curator opens an AI assistant against a fresh Curate Mind instance. The assistant detects an uninitialized profile (via `cm_get_project_profile` returning `profileInitialized: false`) and runs the interview.

The script must follow both UX rules in memory: spell out every concept, never use shorthand, and open every chat with the three-block signpost (where you are, what happens here, what comes next).

**Opening signpost.** The assistant tells the user: this is the Curate Mind setup conversation, this chat configures the project profile and the user style preferences, the next step is the first source ingestion which happens in a separate chat.

**Questions, one at a time, in this order:**

1. What is this project called and what is it about in one sentence? Fills `name`, `description`.
2. What domain or topic are you researching? Fills `domain`.
3. Who is this research for, including yourself? Fills `audience`.
4. What time period or scope matters for this research? Fills `timeHorizon`.
5. What word feels right for the unit of work: research, investigation, intelligence, or something else? Fills `researchUnitLabel`.
6. Curate Mind extracts atomic claims from every source. Some users also want to capture a second thing per source, such as frameworks and analogies (the default), key quotes, decision points, or methodology limitations. Do you want this second capture stage enabled, and if so, what should it capture? Fills `secondaryCaptureEnabled`, `secondaryCaptureLabel`, `secondaryCaptureDescription`.
7. How do you want the assistant to write: analytical and precise, conversational, or formal? Fills user `voice`.
8. Any punctuation or phrases you want banned? (The em dash is a common one.) Fills user `bannedPunctuation`, `bannedPhrases`.
9. Want to draft three to six example questions visitors can try on the web demo? Fills `suggestedPrompts`.

After each block of two or three questions, the assistant calls `cm_preview_prompt_profile` and shows the user the assembled prompt so far. The user can refine before committing.

**Closing signpost.** The assistant tells the user: setup is complete, the profile is saved, the next step is to add the first source. It then provides the exact copy-paste prompt for the first-source-ingestion chat.

---

# Part C — User-facing deliverables (replacing the web settings UI)

## 11. README customization section

The `README.md` gets a new section titled "Customizing Curate Mind for your own research." Plain-language explanation of:

- What is locked (the method) and why
- What is customizable (the project profile and the user style)
- How customization happens (through your own AI assistant via MCP, by pasting one of the prompts from the prompt library)
- A short walkthrough for the first-time setup, pointing at the Initial Setup prompt in the library

The README does not duplicate the prompt library; it links to it.

The current `CLAUDE.md` and `AGENTS.md` files get a parallel update: the hardcoded "Owner: Maicol Parker-Chavez" and "Domain: artificial intelligence strategy" paragraphs are replaced with a "this file is read by AI assistants working in this repo; project-specific facts live in the project profile, fetched via `cm_get_project_profile`" pointer.

## 12. Copy-paste prompt library (specifications only)

Specifications below. Full prompt text is written in a follow-up deliverable once the schema and MCP tools land. Each spec includes the purpose, where the prompt lives, the inputs needed from the user, the sequence of MCP tools the prompt instructs the assistant to call, and the signpost text.

### Prompt 1: Initial Setup (first-run)

- **Location:** `prompts/setup_initial.md`.
- **Purpose:** Strangers clone the repo, install dependencies, and paste this prompt to their AI assistant. It triggers the onboarding interview from Section 10.
- **User inputs gathered during the conversation:** Project basics, domain, audience, time horizon, vocabulary, secondary capture preference, user style preferences, suggested prompts.
- **MCP tools called:** `cm_get_project_profile` (detect uninitialized), `cm_get_user_preferences`, `cm_update_project_profile` (multiple times as the interview progresses), `cm_update_user_preferences`, `cm_preview_prompt_profile` (between blocks).
- **Signpost text required:** Opening block names this as the first setup conversation; closing block hands off to first source ingestion with a copy-paste prompt.

### Prompt 2: Re-customize for a different use case

- **Location:** `prompts/setup_recustomize.md`.
- **Purpose:** A user who has been running Curate Mind for one purpose wants to repoint it at a different topic or use case. Resets profile fields to fresh defaults and re-runs the interview.
- **User inputs gathered:** Same as Prompt 1.
- **MCP tools called:** `cm_reset_profile_to_defaults` with `scope: "project"`, then the full interview from Section 10.
- **Signpost text required:** Opening block warns that this resets the project profile (user style and existing extracted data are preserved); closing block confirms the new shape.

### Prompt 3: Update writing style

- **Location:** `prompts/edit_style.md`.
- **Purpose:** Quick edit to the user style preferences without touching the project profile.
- **User inputs gathered:** Whichever style field the user wants to change.
- **MCP tools called:** `cm_get_user_preferences`, `cm_update_user_preferences`, `cm_preview_prompt_profile`.
- **Signpost text required:** Opening block names this as a quick style edit; closing block shows the diff and confirms.

### Prompt 4: Update audience or scope

- **Location:** `prompts/edit_audience.md`.
- **Purpose:** Quick edit to a single project profile field such as audience or time horizon.
- **MCP tools called:** `cm_get_project_profile`, `cm_update_project_profile`, `cm_preview_prompt_profile`.

### Prompt 5: Change what gets captured in Secondary Capture

- **Location:** `prompts/edit_secondary_capture.md`.
- **Purpose:** Switch the second-stage capture between off, the mental models default, and a free-text description. Includes guidance on how to write a good capture description.
- **MCP tools called:** `cm_get_project_profile`, `cm_update_project_profile`, `cm_preview_prompt_profile`.
- **Note:** This prompt explicitly explains that existing captured items (either mental models or secondary items) are preserved when the configuration changes. Only future extractions are affected.

### Prompt 6: Update the web demo's suggested questions

- **Location:** `prompts/edit_suggested_prompts.md`.
- **Purpose:** Curator wants to change the example questions visitors see on the landing page.
- **MCP tools called:** `cm_get_project_profile`, `cm_update_project_profile`.

---

# Part D — Loose ends and follow-ups

## 13. Migration plan for the existing instance

The current production instance has one project with a thin profile (`name`, `description`, `createdDate`). Migration is one-time and small.

**Script:** `scripts/migrate_profile_backfill.ts`.

**Steps:**

1. Read the existing project record.
2. Set `domain` from current `CLAUDE.md` "Domain" line.
3. Set `audience` to a sensible default (curator can edit later).
4. Set `timeHorizon` based on the dual-purpose framing memory ("February 2026 research onward").
5. Set `researchUnitLabel: "research"`, `assistantRoleName: "research assistant"`.
6. Set `secondaryCaptureEnabled: true`, `secondaryCaptureLabel: "Mental Models"`, `secondaryCaptureDescription: <existing Pass 2 prompt>`.
7. Move the current hardcoded hero examples from the web into `suggestedPrompts`.
8. Set `profileInitialized: true`, `profileVersion: 1`.
9. Create the `userPreferences` row with: `voice: "analytical"`, `bannedPunctuation: ["—"]` (from the existing em-dash memory rule), other defaults.
10. Print a diff of what was set so the curator can review.

No extracted data is touched. Append-only invariant holds.

## 14. Amendments to existing documentation

### `Architecture_Spec.md`

- Section "Progressive Disclosure": replace the four-layer model with the three bands (Stance, Evidence, Source). Add a note that the four-layer language is deprecated.
- Section "Reader Persona (Others)": delete the persona description. Replace with a single "Curator" persona block that describes the one access tier.
- Section "Extraction Pipeline": rename the four passes to the four stages (Extract, Secondary Capture, Enrich, Review). Mark Secondary Capture as optional and configurable.
- Section "Document Preparation": fold under Extract.
- Section "MCP Query Protocol": no functional change, but rename `cm_search` mode from "Explore and Synthesize" to keep using the same name (already descriptive) and rename `cm_ask` mode from "Analyst and Verify" to "Cite and Trace" so the language matches the retired-persona model.

### `Design_Decisions_Log.md`

Amend in place:

- **Decision 13** (Reader Persona Access Boundary): add an amendment block at the bottom noting the persona retirement and ratifying anchor-quote-in-URL-only as the current copyright mitigation.
- **Decision 19** (Four-Pass Pipeline): amend to rename the passes to stages and mark Secondary Capture as optional.
- **Decision 20** (Sub-Agent Architecture with Direct Convex Writes): amend to note that Secondary Capture now runs in its own sub-agent when enabled, reversing the original P1+P2 combination.

Add new decisions:

- **Decision 33: Secondary Capture as a Customizable Stage.** Captures the rationale for moving mental model scanning from locked to project-configurable.
- **Decision 34: Three-Band Response Shape Replaces Four-Layer Access Matrix.** Captures the retirement of the persona-based access model.
- **Decision 35: Three Customization Layers (Locked, Project Profile, User Style).** Captures the customization architecture itself.
- **Decision 36: Descriptive Stage Naming, No Pass Numbers in User-Facing Surfaces.** Captures the renaming rule.

### `CLAUDE.md` and `AGENTS.md`

- Remove the hardcoded "Owner: Maicol Parker-Chavez" and "Domain: artificial intelligence strategy" lines.
- Add a section pointing AI assistants at `cm_get_project_profile` for project-specific facts.
- Update the "Extraction Pipeline" section to use the renamed stages.
- Keep the `agents:sync` workflow.

## 15. Out of scope for this version

- Web settings interface. Customization is MCP-only in this version. A `/settings` route can be added later if the cost of asking strangers to set up MCP becomes a meaningful onboarding friction.
- Fully custom secondary entity schemas. The free-text description model in Section 6 is enough.
- Multi-curator support. The user preferences singleton assumes one curator per instance.
- Per-project user style overrides. Style is instance-wide in this version.
- Per-language style variants. One `language` field, applied globally.
- A reset that recovers from a corrupted Convex state. `cm_reset_profile_to_defaults` only resets profile and preferences rows, not the data tables.

## 16. Recommended sequencing and updated Task 2.2 scope

This proposal is sequenced to land in independent pieces. Each piece is independently shippable.

| Order | Task | Why this order |
|---|---|---|
| 1 | **Task 2.2 (updated, see below).** Rewrite the four skill files using the renamed stages and the UX rules. Adds placeholder fields for customization without depending on the schema. | Highest daily-workflow impact for the curator. Lowest blast radius (markdown only). Independent of the schema work. |
| 2 | **Schema and MCP tools.** Implement Section 7 and Section 8. Migrate the existing instance per Section 13. | Foundation for everything downstream. No user-visible change until something reads the new fields. |
| 3 | **Copy-paste prompt library (full text).** Write the six prompts specified in Section 12. | Depends on the MCP tools existing. |
| 4 | **README and documentation updates.** Section 11 and Section 14. | Depends on the renamed stages and the prompt library both existing. |
| 5 | **Frontend hardcoded content removal.** Hero examples read from `suggestedPrompts`, persona name reads from `assistantRoleName`, etc. | Depends on the schema existing. |

### Updated Task 2.2 scope

The original Task 2.2 wording locked Pass 2 as mental model scan and used Pass 1 through Pass 4 in the skill names. Both contradict decisions in this proposal. The corrected scope:

> **Task 2.2 (revised):** Revise the four Curate Mind extraction skill files (`cm-batch-orchestrator`, `cm-curator-review`, `cm-deep-extract`, `cm-evidence-linker`) for open-source portability. Use the renamed stage vocabulary: Extract (no Research Lens, no tags, no interpretation), Secondary Capture (optional per project, default mental model scan, runs in its own sub-agent with a fresh context window when enabled), Enrich (Research Lens applied, tags, confidence, extraction notes), Review (curator, by exception). Apply both user-experience rules to every skill: spell things out (no pass numbers, no acronyms, assume the reader is brand new), and open every skill activation with the three-block signpost (where you are in the process, what happens in this chat, what comes next including a copy-paste prompt for the next chat if applicable). Remove or isolate the hardcoded artificial-intelligence-strategy assumptions. Add placeholder fields and notes for future project-profile customization: domain focus, secondary-capture configuration, high-value evidence types, tag strategy, confidence rubric, and preferred output style. Skills hardcode "Mental Models" as the default Secondary Capture label for now; they will read this from the project profile after the schema work in step 2.
