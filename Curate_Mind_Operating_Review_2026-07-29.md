# Curate Mind Operating Review, July 29, 2026

Evidence base: full git history, week folders and review trackers, the live Convex corpus (via the Curate Mind MCP tools), and 97 Claude Cowork session transcripts from March through July 2026 (including the predecessor CRIS sessions).

---

## The one-paragraph diagnosis

The architecture works. Extraction quality, citation traceability, and position synthesis have all measurably improved since March, and the corpus has become a reliable evidence engine for your real deliverables. What does not work is the operating model around it: you are the message bus. A single week of content costs 4 to 6 hand-chained chat sessions, spread across 5 or more calendar days, held together by prompts you carry between chats and "go" messages you type between waves. Nothing broke in July. The mechanical overhead simply went unpaid for three weeks, and because the system has no memory of its own state between sessions, the cost of coming back compounds the longer you are away. The automation target is therefore not the thinking. It is the chaining.

---

## Part 1: What you are leveraging effectively

**1. The append-only foundation is doing exactly what it was designed to do.** This is not a create-and-abandon corpus. 41 positions across 11 themes, median version around 8, and half of all positions were re-versioned in July. Your deskilling position is at version 26 with 25 counter-evidence data points attached. The one retired position ("Accidental Profitability") kept clean lineage. Only one position is meaningfully stale (the diffusion-speed position, untouched since April 19).

**2. The Research Lens has become your drift detector.** The July 21 session opened by diffing the Lens (regenerated July 13) against the May narrative and surfaced exactly what had shifted ("productivity is table stakes, alignment is the differentiator" superseding the access/equalizer frame). In March you asked CRIS "how has our thinking shifted over four weeks?" and it literally could not answer. The Lens now answers that question class as an opening move.

**3. Citation discipline is compounding.** The verification conventions you forced into existence mid-session in May (month-and-year citations, the no-guessing rule, the anchor-quote source index) paid off by July: the system itself flagged "the 30%/300% multiplier is not traceable to VentureBeat in the corpus" and "the 0.02% figure has no named primary source." The corpus catching fabrication risk before you do is the whole point of the architecture, and it is happening.

**4. The staged extraction pipeline matured.** March extraction was plagued by invented enum values, hallucinated data point IDs, and context blowouts. By July 8-9, 13 sources went through Extract, Secondary Capture, and Enrich in about 2 hours of active time with near-zero errors, producing 272 data points and 47 mental models. The sub-agent-per-stage design with fresh contexts is the reason.

**5. Review by exception works, and you have naturally invented its best interface.** Flag adjudication is where your genuine judgment lives (tier overrides, contradiction rulings, "create a new position and link its evolution"). You already answer in ballot form ("B1: B, B2: A, B3: A plus a paragraph where it matters"). That format is the keeper.

---

## Part 2: What you are skipping, forgetting, or not using

**1. You almost never ask your corpus anything.** This is the single biggest finding. Across 97 corpus sessions since March, `cm_ask` was used in exactly three: May 14, May 24, and July 21. Roughly 90 of 97 sessions feed the machine; three eat from it. Every ask session produced high-value output (the Video 1 brief, the narrative document, the v3 refresh), which makes the scarcity stranger: the tool works, you just never reach for it outside CoP deadlines. Related: the suggested prompts in the project profile appear unused, and the Stance/Evidence/Source labeling convention specified in CLAUDE.md has never appeared in a single real answer. The citation format that actually ships is the one you co-designed in the narrative docs.

**2. Trend detection exists as a feature but not as a practice.** `cm_get_tag_trends` was built for exactly the "what is emerging" question, but there is no evidence you consult it. And the tag vocabulary currently undermines it: 1,297 tags for roughly 7,000 data points, hundreds of single-use tags, near-duplicates ("Trust" / "Trust in AI" / "Trust and Verification", two capitalizations of human-in-the-loop), and 36 inconsistent category schemes. Trend lines drawn over a fragmented vocabulary are noise.

**3. Thirteen sources are ingested but invisible.** The June 2-3 batch left 13 sources indexed but never extracted (including Anthropic's Project Glasswing piece and Every's Eight Levels of AI Adoption). They have sat for 8 weeks with zero data points: invisible to positions, search, and tag retrieval.

**4. Bookkeeping has drifted from reality.** The ~140 February files show as pending in review trackers even though they were ingested in the March 22-23 backfill. The three most recent July week folders have no tracker at all. One tracker exists but is empty (a scan started and abandoned). Your real backlog is roughly 75 to 80 files, not 220, but no surface tells you either number.

**5. The skills are bypassed and the customization wiring never landed.** Several batch runs explicitly said "do not invoke any skill file" because inline prompts were more controllable, and the skill registry failed twice ("Unknown skill"). All four pipeline skills still carry "placeholders for future wiring" tables ten weeks after the customization proposal. And `cm_correct_claim`, the tool Design Decision 37 was written for, was never added to the toolset registry, so it has been unreachable in every toolset since June 17 (already flagged as a fix task).

**6. Deliverables are drifting back outside the system.** Three hand-versioned CoP narrative files at the repo root ("v2", "v3", "Rev 5" with hand-maintained changelogs) are exactly the pattern Design Decision 1 exists to prevent. The July 21 session partially redeems this (v3 was regenerated from the corpus, not hand-edited), but the pattern deserves a proper home: a repeatable "narrative refresh" workflow rather than loose root files.

**7. Curator observations happen only on synthesis days.** Observations cluster on May 11, July 7, and July 13. The connective-insight layer is used in bursts, never during the week when the connections actually occur to you.

---

## Part 3: Has insight generation improved because of the architecture? Yes, measurably

| Dimension | March (CRIS era) | July (Curate Mind) |
|---|---|---|
| Query style | Keyword soup ("AI adoption enterprise organizational maturity") | Full analytical questions with output contracts ("Give the specific percentages comparing high-anxiety and low-anxiety workers") |
| Reliability | 16 MB server crashes, manual retries, jq hacks on dumped files | 11 consecutive clean `cm_ask` calls; one transient limit that self-recovered |
| Traceability | Tag labels, no links, you hand-verified against local files | Resolved links, capture dates, verbatim anchor quotes; the system flags untraceable claims itself |
| Temporal reasoning | "What shifted over four weeks?" was unanswerable | Research Lens diff answers "what changed since we last touched this" as a standard move |
| Extraction quality | Invented enums, hallucinated IDs, monolithic passes | Staged sub-agents, near-zero validation errors, repair passes when tools truncate |

The honest caveat: the improvement is concentrated in evidence quality and verification. The trend-identification half of your question (what is emerging across the corpus over time) is still mostly latent, because tag hygiene and the never-consulted trend tool haven't yet been connected to a practice.

---

## Part 4: Where the opportunities are

1. **Close the produce/consume loop.** The corpus is 30x more fed than eaten. Every mechanism below that reduces feeding cost should be paired with one that makes asking cheap and habitual.
2. **A recurring "what changed" brief.** You keep asking this question manually (March, week reviews, July 21). It is generable on demand from the Lens diff, new positions, and tag movers after each cycle: ephemeral output, so it doesn't violate the no-maintained-deliverables rule.
3. **Tag vocabulary consolidation.** One merge-and-retire pass (the tools exist: retire tag, batch re-tag) would make `cm_get_tag_trends` meaningful and sharpen evidence linking.
4. **Templatize the July 21 flow.** Lens diff, per-change `cm_ask` grounding, anchor-quote reference index, append a new version tab in Google Drive. That session is your best pattern and it currently lives only in your memory.
5. **The Intake Inbox and Daily Discovery you already spec'd.** PRD section "Future Work" describes watched sources, candidate queues, and approval flow, parked "until the intake tools are tested end-to-end." With 143 ingestions behind you, the precondition is met, and it is precisely the per-source "what's new today, let me pick" capability you said you want.

---

## Part 5: Automation roadmap (mostly current technology)

Your constraint was to stay on current technology where possible. Almost everything below uses what you already run: Convex, the MCP server, Cowork, Supadata, scheduled Claude agents. The judgment stays with you; the chaining goes away.

### Phase 0: One-time repair week (small, prompt-sized tasks)

- Extract the 13 indexed-but-never-extracted June sources.
- Reconcile review trackers: mark February ingested, create trackers for the three July weeks, clear the abandoned empty one.
- Register `cm_correct_claim` in the toolsets (task already flagged).
- Fix the two silent truncation bugs (batch data point fetch clipping at ~25 records, per-source listing clipping at ~33) and make every generated report carry full Convex IDs. These caused every ArgumentValidationError storm since May.
- Tag consolidation pass: merge near-duplicates, retire singletons, collapse the 36 category schemes to a handful.
- Resolve the one stuck July 11 PDF (the BetterUp workslop report) and the failed-source duplicates.

### Phase 1: Remove the human message bus

- **Pipeline state lives in Convex, not in pasted prompts.** A small `pipelineRuns` record per week (stage, wave, pending IDs, flags outstanding). Every session opens with one standing prompt ("continue processing") and reads its own state. This eliminates the handoff-prompt ritual that ended every session since March.
- **Waves auto-advance.** Replace the "go" gates with checkpointed autonomous progression plus a single end-of-run report. Auto-resume after rate limits using the resume protocol you already hand-built in May.
- **Scheduled week close.** A scheduled agent runs embedding drain and Lens regeneration after integration, instead of asking you to open one more chat (the last thing the pipeline ever asked of you, on July 13, was to carry one more prompt to one more chat).
- **Ballot-format review.** Flag reports arrive as a numbered ballot you can answer in one message, from your phone if you want. This is the one step that stays human, shaped the way you already answer it.

### Phase 2: Capture and discovery (the "what's new from my sources" wish)

- **Watched-sources table plus a daily discovery agent.** YouTube channels expose free RSS feeds (no API key needed), blogs and publishers have RSS, and Supadata (already in your stack) handles fetching and transcripts. A scheduled agent checks your watchlist daily, writes candidates to an `intakeCandidates` queue, and sends you a short digest. You reply with a ballot ("1, 3, 5 yes"); approved items are fetched into the correct capture-week folder automatically.
- **Newsletters:** either connect the Gmail connector in Cowork, or use a newsletter-to-RSS bridge (Kill the Newsletter is free) so newsletters flow through the same watchlist. This is the only genuinely new external service worth adding, and it is optional.
- **Extend the capturedAt fix** (your July 14 PR) from PDFs to `cm_fetch_url` and `cm_fetch_youtube`, ending the folder-moving chore you flagged in your May 11 retro.

### Phase 3: Make consumption automatic

- **Post-cycle "what changed" brief:** generated after each integration wave (Lens diff, new and re-versioned positions, top tag movers, contradictions). Delivered to you, never stored as a maintained doc.
- **A "narrative refresh" skill** encoding the July 21 pattern, so any deliverable (CoP, LinkedIn, client brief) can be re-grounded against the corpus in one command.
- **A monthly deep question:** one scheduled `cm_ask` session against your own suggested prompts, so the analyst layer gets exercised even without a deadline.

### What stays human, permanently

Source selection (the ballot), flag adjudication, position creation and stance changes, and every editorial call on deliverables. The transcripts show these are the only steps where your judgment actually changed outcomes; everything else was you keeping a machine company.

---

## Addendum: One answer contract, three clients (added after discussing curatemind.io)

The site's Ask feature is not just a demo; it is the only place the full response-band experience actually exists. In `convex/chat.ts`, answers are composed server-side: the Convex action calls the Anthropic API directly with a locked system prompt (the code comments say locked "because UI citation cards and post-processing depend on [E#] labels plus the trailing cited_dp_ids JSON"). Enforcement lives in the server, so the site never has to ask for citations. The MCP path delegates composition to whatever model is calling the tool, which is why the same corpus produces cited answers on the site and citation-optional answers in Cowork. The evidence-marker convention is not dead; it just never made it across the MCP boundary.

The "MCP instead of SaaS" vision is architecturally sound and partly built already (the invite-gated public MCP beta from June 9 serves `cm_get_research_pack`). The recommendation is to refactor toward one canonical answer contract with three clients:

1. **Website** keeps calling the existing composer. No change; it becomes the showroom for the experience.
2. **Public MCP** gets a tool that returns the server-composed answer plus the structured evidence array, using the same composer. Guaranteed parity in any MCP client. Cost note: server-side composition bills your API key per query, which is fine invite-gated but needs caps or a bring-your-own-key path before open distribution.
3. **Curator MCP (your own use)** stays client-composed so your subscription does the work, but the contract travels with the tool: `cm_ask` returns the locked render rules as part of its pack, the tool description carries the output contract, and the workflow-router ask path enforces it. That ends the "why did you not show the citations" pattern in your own sessions.

This also reframes one earlier finding: part of why `cm_ask` was used only three times is that the Cowork answer experience is degraded relative to the site. Fixing parity is not only a product move for outside users; it should raise your own consumption of the corpus.

## Addendum 2: Product direction (curator cockpit, in-Claude parity, living report)

Three goals defined in discussion on July 29, all views over the existing foundation:

1. **Curator cockpit.** The site already renders themes, positions, and sources; what's missing is the operational layer: intake inbox (candidate queue with approve/skip), pipeline status (week, stage, pending, flagged), and position health (staleness, evidence counts, change summaries). Operating pattern: **decide in the interface, execute in Cowork.** The dashboard never calls a model; decisions queue in Convex and the next "continue processing" Cowork session executes them on the Claude subscription. Pipeline state in Convex (Phase 1) is the prerequisite that makes the cockpit a cheap read/write view.
2. **Website-quality answers inside Claude, without asking.** For the curator: an ask skill that enforces the locked answer contract and renders the same evidence-card panel as the site (HTML inline in Cowork), composed on the subscription. For outside users: the public MCP with server-composed answers (guaranteed parity, API-key cost, keep invite-gated) or hardened-contract client composition (free, best-effort).
3. **Living report.** Position versioning already produces the changelog as data. A report-style public view (current positions, "what changed" feed from recent versions, click-through to evidence and sources) is generated on load, compliant with the no-maintained-deliverables rule, and creates external accountability: a stale "last updated" date is visible debt.

Value thesis update: the curator is a publisher, not a question-asker (three Q&A sessions in five months, every one feeding an audience-facing narrative). The corpus's natural value model is push (living report, derivative narratives) rather than pull (occasional Q&A). One open decision: whether the cockpit and living report fold into the planned April frontend re-architecture or advance ahead of it.

## On the backlog (noted, per your "analysis only" choice)

The genuine backlog is roughly 75 to 80 files: 37 from the July 5-11 model-release week, 18 from July 19-25, 11 from the current week, 7 from July 12-18, and a few May/June stragglers. At your demonstrated July throughput (13 sources in ~2 hours of active extraction), that is about three batch cycles. With Phase 1 in place, it would be three "continue processing" prompts.
