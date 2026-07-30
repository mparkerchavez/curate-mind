# cm_ask Rendering Design

**Status:** Stage one is **built and shipped** (2026-07-30). Stage two, the MCP Apps widget, is **parked** by decision, not rejected. This document is the pickup point for that work.

Decisions are recorded in `Design_Decisions_Log.md` as Decisions 40 through 43. The response shape is summarized in `Architecture_Spec.md` and `CLAUDE.md`. This document keeps the reasoning and the stage two detail that would bloat those files.

**Date:** 2026-07-30

---

## 1. Why this document exists

The `cm_ask` tool now ships a render contract so any client model produces cited answers without being asked. Building it surfaced four problems that are entangled with each other, and one of them turns out to break evidence carry-forward. Meanwhile MCP Apps has made interactive widgets an official capability, which changes how much effort the text path deserves.

This document states the current architecture plainly, records what each defect actually is, and proposes two stages of work.

---

## 2. The current architecture

### Two surfaces, one composer

Both curatemind.io and the `cm_ask` tool call the same Convex action, `api.chat.askAnalyst`. That action retrieves evidence and then calls Claude to write a finished answer before either surface sees anything.

```
                      convex askAnalyst
              (retrieves evidence, composes an answer)
                              |
              +---------------+----------------+
              |                                |
     website reads the object          MCP server formats it into
     directly and renders it.          one markdown text block and
     No character cap.                 caps it at 25,000 characters.
              |                                |
     renderAnswerBlocks turns          a second model reads that block
     [E#] into clickable chips         and writes what the curator sees
```

Two consequences worth holding onto:

1. The website never reads a single line of the MCP formatter's output. Anything we change in `mcp/src/tools/query.ts` cannot reach curatemind.io.
2. The website renders the composed answer verbatim. Over MCP a second model reads it and rewrites. That asymmetry is the source of defect 2.

`askGrounded` and `buildGroundedSystemPrompt` are a separate, dormant path. Their only caller is `WorkspacePage.tsx`, which is not in the router. The live rules for both surfaces are in `buildAnalystLockedRulesBlock`.

### Three separate `[E#]` namespaces

This is the root of more than one bug. Three different things use bracket-E-number labels and they mean different things:

| Namespace | Where it lives | Resolved against |
|---|---|---|
| Position-internal | Saved stance text on a Research Position | That position's own evidence chain, built up over months |
| Turn-local | The answer for one `cm_ask` call | That call's `citations` array |
| Prior-turn | Earlier answers still visible in a chat transcript | A map that no longer exists |

The website handles the first two correctly by using a different map per context. It has no third problem, because each answer bubble stores its own map in `answerState`. A chat transcript has no such store, which is why the third namespace exists only over MCP.

### Labels are positional, so they move

In `askAnalyst`, carried evidence is placed first and fresh evidence appended, then labels are assigned by position: `E${index + 1}`.

So if turn 1 cites E1 and E3, turn 2 carries both, compacts them to E1 and E2, and gives fresh evidence E3 onward. Turn 1's `[E3]` and turn 2's `[E3]` are different data points. Labels are turn-local identities, not stable ones.

### Evidence is printed three times over MCP

`formatAnalystPackMarkdown` prints each cited item's claim and anchor quote:

1. Under every paragraph that cites it, once per citing paragraph
2. Again under "Cited in the Answer"
3. Again inside the structured block at the bottom

Measured on a realistic pack (12 data points, 2 positions, a 3.9k composed answer):

| Section | Characters |
|---|---|
| Render contract | 2,396 |
| Answer plus per-paragraph evidence | 7,955 (composed answer itself: 3,879) |
| Positions | 7,619 |
| Retrieved evidence | 7,018 |
| Structured block | cut entirely |
| **Total** | **25,081 against a 25,000 limit** |

The redundant copies push out the structured block, which is the only place identifiers appear.

---

## 3. The four defects

### Defect A: the hybrid label breaks carry-forward (highest priority)

The composer sometimes writes labels like `[E1, cited within P1]`, mixing the position-internal namespace with the turn-local one. Observed in a live answer.

This is not cosmetic. Two regexes both require an exact `[E` digits `]`:

- `collectCitedIdsFromInlineLabels` in `convex/chat.ts:1465` uses `/\[E(\d+)\]/g`
- the web renderer in `web/src/lib/workspace-utils.tsx:570` splits on `/(\[E\d+\]|\[C\d+\]|...)/`

A hybrid label matches neither. So:

- On curatemind.io it renders as raw text with no clickable chip.
- The data point is **not recorded in `citedDataPointIds`**, so it is **not carried into the next question**, and its evidence card is not marked as cited.

That last point matters most: this defect silently drops evidence from exactly the carry-forward mechanism that keeps the narrative verifiable as it changes. It is live on the public site today.

**Fix:** one rule added to `buildAnalystLockedRulesBlock` in `convex/chat.ts` forbidding hybrid labels and stating that position-internal numbering is a separate namespace. Prompt text only. No schema, no components, no rendering. It changes public output, so it needs explicit approval.

### Defect B: nothing drives threading over MCP

The website calls `getPriorCitedDataPointIds(turns)` and passes the result as `carriedDataPointIds` automatically on every follow-up.

Over MCP, `carriedDataPointIds` is an available parameter that nothing instructs anyone to use. Not the tool description, not the render contract, not the router skill. A follow-up question in Cowork silently starts from scratch, so the narrative continuity built for the website does not happen at all.

It is also currently impossible to comply, because `citedDataPointIds` lives only in the structured block that truncation destroys.

**Fix:** put the identifiers in the reference list where they survive, and add a contract rule that a follow-up in the same thread passes the previously cited identifiers as `carriedDataPointIds`.

### Defect C: the response does not fit its own budget

Described in section 2. MCP-only. Invisible to curatemind.io.

**Fix:** stop printing evidence three times. Details in stage one below.

### Defect D: the contract conflicts with the pre-composed answer

The tool description says to use the composed answer as the primary response. The render contract says to lead with stance, cite inline, and end with a reference list, which reads as an instruction to write rather than relay. Those disagree.

**Fix:** state explicitly that the contract governs relaying and repairing the composed answer, not replacing it. Rationale in stage one.

---

## 4. Stage one: a lean text path (shipped 2026-07-30)

Goal: correct, portable, and small. Not beautiful. The text path is the fallback path and the Codex path, and stage two replaces it as the primary experience, so it should not be gold-plated.

1. **Fix the hybrid label at the composer.** Defect A. One rule in `buildAnalystLockedRulesBlock`. Highest value per line changed, because it repairs carry-forward on both surfaces at once.

2. **Print cited evidence once.** Remove the "Cited in the Answer" section. Under each paragraph, keep a single compact pointer line per cited label rather than the full item, for example `[E1] Continuous AI in Practice (GitHub, 2026-02-05)`. This preserves the scan-the-quality use case at a fraction of the size.

3. **Make the reference list the anchor of the answer.** One entry per cited label, in label order, carrying: label, source title, author, publisher, date, anchor quote verbatim, resolved link, the data point identifier, and whether the evidence is carried or fresh. This list is load-bearing, not decorative. It is the only thing pinning turn-local labels to stable identities in a transcript that has no state.

4. **Slim the structured block** to identifiers, links, and threading arrays. Drop the restated claim and anchor text.

5. **Add the threading rule** to the contract and the router skill. Defect B.

6. **Resolve relay versus rewrite** as relay and repair. Defect D. Reasons: the website renders the composed answer verbatim, so rewriting means the same question gets different answers depending on where it is asked; the composed answer is the only place your saved style preferences are applied; and rewriting risks drifting the `[E#]` tokens that carry-forward depends on. The client's job is to present the composed answer, repair contract violations in it, and append the reference list that the website supplies through citation chips instead.

Everything except item 1 is confined to `mcp/` and `skills/`.

---

### What actually shipped

All six items above, plus two things the work surfaced:

- **Evidence pointers carry quality signals.** The per-paragraph pointer includes evidence type, confidence, and source tier alongside title and date, for example `- [E1] Continuous AI in Practice (GitHub, 2026-02-05) · case-study · strong · tier 2`. This costs roughly twenty characters more than the title-only line in the plan and directly serves the scan-the-quality use case, so it was worth the small deviation.
- **The machine-readable pack is now fit-or-omit.** If it cannot fit inside the character limit whole, it is dropped entirely with a short note rather than truncated into invalid JSON. Half a JSON object is worse than none for a programmatic reader, and everything operationally required already sits above it in prose.

Measured against a representative pack (12 data points, 2 positions, a 3.9k composed answer):

| Section | Before | After |
|---|---|---|
| Render contract | 2,396 | 3,102 |
| Answer plus per-paragraph evidence | 7,955 | 4,371 |
| Positions | 7,619 | 7,619 |
| Reference list, additional context, carry forward | 7,018 | 4,148 |
| Machine-readable pack | cut entirely | 5,748, present |

A cited claim and its anchor quote now appear exactly once each, verified by test.

### Known limit, not yet addressed

Position stance text is now the largest section and is uncapped. A pack with several long stances can still exceed the limit, in which case the machine-readable pack is dropped. The contract, reference list, and carry-forward identifiers survive by construction because they sit above it. Capping stance text was considered and deliberately not done, since stance-first rendering depends on that text. Revisit if truncation shows up in practice.

## 5. Stage two: an MCP Apps widget (parked)

MCP Apps became an official MCP extension on 26 January 2026. A server attaches a self-contained HTML widget to a tool result and the host renders it in a sandboxed iframe. The same server works in Claude, ChatGPT, Copilot, VS Code Insiders, and Goose.

```
cm_ask declares _meta.ui.resourceUri -> ui://curate-mind/analyst-answer
server serves that resource as self-contained HTML
host renders it in a sandboxed iframe
widget and host talk over JSON-RPC on postMessage
widget can call back: callTool, sendFollowupMessage, state
```

### Why it fits this project

A tool result has three channels:

| Channel | Who sees it |
|---|---|
| `content` | The model, and text-only hosts. Required even when a widget exists. |
| `structuredContent` | The widget. Host-dependent whether the model sees it. |
| `_meta` | The widget only. Hidden from the model in both specs. |

The full evidence pack moves to `_meta`, where it costs the model nothing, and `content` stays compact. The character budget fight disappears, because rich presentation and model context stop competing for the same space.

It also collapses several problems at once. The widget is the evidence panel, so clickable citations work in chat. It renders inline chips against the answer, which is what `renderAnswerBlocks` already does on the site, so scanning quality needs no prose at all. And because widgets hold state and can call tools, turn-local labels stop being a hazard: the widget resolves them live against real identifiers instead of leaving positional numbers stranded in the scrollback.

Most importantly, the widget and the website's React renderer are the same component solving the same problem. Serving it once as a `ui://` resource is the concrete way to stop the two surfaces drifting.

### Known drift to fix along the way

The two surfaces already resolve source links differently. The MCP uses storage first, then canonical, and appends a `#:~:text=` fragment so the link jumps to the anchor quote. The website (`web/src/components/SourceBadge.tsx:88`) uses a different precedence and appends no fragment, so its links do not jump to the quote. Neither is wrong. They drifted because the logic was written twice.

### Risks

- **Not yet stable in the clients you use.** Open bugs for widgets rendering as empty containers in Claude Code Desktop (`anthropics/claude-code#65653`) and UI resources not rendering in Claude Desktop and claude.ai (`ext-apps#671`).
- **Codex appears to be text-only.** No evidence it hosts widgets. It would fall back to `content`, which is why stage one still matters.
- **The two specs disagree on `structuredContent` visibility.** Portable rule: model-needed data in `content`, widget-only data in `_meta`. Do not depend on `structuredContent` either way.
- **This is a re-platform, not a formatting change.** Sequence it after stage one, and only once the clients look stable.

---

## 6. What we are not doing

- Not adding per-paragraph quality strips. That was a good idea for a world where markdown is the final experience. The widget is the better home for it.
- Not deleting `WorkspacePage.tsx` or the dormant `askGrounded` path without explicit instruction, per `CLAUDE.md`.
- Not changing the website's rendering, routing, or components.
- Not touching the append-only rules. Nothing here creates, mutates, or deletes records.

---

## 7. Decisions taken

All four defects were approved and fixed on 2026-07-30, and stage two was parked. Recorded as Decisions 40 through 43 in `Design_Decisions_Log.md`.

## 8. Picking stage two back up

Preconditions worth checking before starting:

1. Do widgets render reliably in the clients actually in use? Re-check `anthropics/claude-code#65653` and `ext-apps#671`.
2. Does Codex host widgets yet? If not, the text path stays as the fallback and must keep working.

First moves when it does start:

1. Move the full evidence pack from prose into `_meta`, keep `content` as the compact text fallback, and stop depending on `structuredContent` visibility either way.
2. Build the widget from the existing web components (`renderAnswerBlocks`, the citation map, the evidence panel) rather than writing a second renderer.
3. Fold the source-link precedence drift noted in section 5 into that shared component so both surfaces resolve links the same way.
4. Revisit the position stance size limit from section 4, which stops mattering once the pack lives in `_meta`.
