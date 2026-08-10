// Guard test: the cm_ask render contract must actually reach the client, both
// as a markdown block and as the renderContract field in the machine-readable
import type { McpServer } from "@modelcontextprotocol/server";

// pack, and the tool description must state it.
//
// Why this exists: the contract is the only thing that makes a cm_ask answer
// come back cited when the curator did not ask for citations. If it silently
// drops out of the response or the description, answers quietly regress to
// whatever shape the calling model prefers, and nothing else fails.
//
// Run with: node --import tsx --test mcp/src/tools/renderContract.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  CM_ASK_RENDER_CONTRACT,
  formatAnalystPackMarkdown,
  registerQueryTools,
} from "./query.js";

function getCmAskDescription(): string {
  let description = "";
  const fakeServer = {
    registerTool: (name: string, config: { description?: string }) => {
      if (name === "cm_ask") description = config.description ?? "";
      return undefined;
    },
  } as unknown as McpServer;

  registerQueryTools(fakeServer);
  return description;
}

const samplePack = {
  question: "What does the research show?",
  answer: "Stance paragraph citing [E1].",
  citations: [
    { label: "E1", dataPointId: "dp1", isCited: true },
    { label: "E2", dataPointId: "dp2", isCited: false },
  ],
  citedDataPointIds: ["dp1"],
  carriedDataPointIds: ["dp0"],
  freshDataPointIds: ["dp1", "dp2"],
  observations: [{ observationId: "o1", content: "An observation." }],
  mentalModels: [],
  positions: [
    {
      positionId: "pos1",
      title: "A position",
      currentStance: "The stance.",
      supportingEvidenceCount: 1,
      counterEvidenceCount: 0,
    },
  ],
  dataPoints: [
    {
      label: "E1",
      dataPointId: "dp1",
      origin: "fresh",
      interpretation: "A claim.",
      anchorQuote: "the verbatim anchor quote",
      evidenceType: "statistic",
      confidence: "strong",
      source: { title: "A source", publisherName: "A Publisher", canonicalUrl: "https://example.com/a" },
    },
    {
      label: "E2",
      dataPointId: "dp2",
      origin: "carried",
      interpretation: "An uncited claim.",
      anchorQuote: "another anchor quote",
      evidenceType: "framework",
      source: { title: "Another source", canonicalUrl: "https://example.com/b" },
    },
  ],
};

test("the render contract carries the required rules", () => {
  const rules = CM_ASK_RENDER_CONTRACT.rules.join(" ");

  assert.match(rules, /stance/i, "contract must require stance first");
  assert.match(rules, /\[E1\]/, "contract must bind inline citations to [E#] labels");
  assert.match(rules, /source reference list/i, "contract must require a trailing reference list");
  assert.match(rules, /anchor quote/i, "contract must require anchor quotes in the reference list");
  assert.match(rules, /Relay, do not rewrite/, "contract must settle relay over rewrite");
  assert.match(rules, /carriedDataPointIds/, "contract must instruct follow-up threading");
  assert.ok(CM_ASK_RENDER_CONTRACT.version.length > 0, "contract must be versioned");
});

test("cited evidence is written out in full exactly once", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);
  const cited = samplePack.dataPoints[0];

  assert.equal(
    markdown.split(cited.anchorQuote).length - 1,
    1,
    "a cited anchor quote must appear once, in the source reference list only"
  );
  assert.equal(
    markdown.split(`Claim: ${cited.interpretation}`).length - 1,
    1,
    "a cited claim must be written out once"
  );
  // The compact pointer beneath the citing paragraph carries the label and
  // quality signals, not the full item.
  assert.match(markdown, /Evidence cited here:/);
  assert.match(markdown, /- \[E1\] A source \(A Publisher\) · statistic · strong/);
});

test("the reference list carries the identifier and origin needed to thread", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);

  assert.match(markdown, /## Source Reference List/);
  assert.match(markdown, /Data point id: `dp1` · fresh for this question/);
  assert.match(markdown, /## Carry Forward/);
  // Union of what was carried in and what this turn cited, matching the
  // website's getPriorCitedDataPointIds behavior.
  assert.match(markdown, /`dp0`, `dp1`/);
  assert.ok(
    markdown.indexOf("## Carry Forward") < markdown.indexOf("## Machine-Readable Pack"),
    "carry-forward identifiers must sit above the truncatable machine pack"
  );
});

test("uncited evidence is listed compactly with its identifier", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);

  assert.match(markdown, /## Additional Retrieved Context/);
  assert.match(markdown, /- \[E2\] Another source · framework · id `dp2`/);
  assert.equal(
    markdown.split("another anchor quote").length - 1,
    0,
    "uncited evidence must not reprint its anchor quote"
  );
});

test("background items are summarized by count, not reprinted", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);

  assert.match(markdown, /1 curator observation\(s\) and 0 secondary capture item\(s\)/);
  assert.equal(markdown.includes("An observation."), false);
});

test("the analyst pack markdown leads with the render contract", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);

  assert.match(markdown, /## Render Contract \(follow exactly\)/);
  for (const rule of CM_ASK_RENDER_CONTRACT.rules) {
    assert.ok(markdown.includes(rule), `render contract rule missing from markdown: ${rule}`);
  }
  assert.ok(
    markdown.indexOf("## Render Contract") < markdown.indexOf("## Answer"),
    "the contract must appear before the composed answer"
  );
});

test("the machine-readable pack repeats the render contract", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);
  const jsonBlock = markdown.slice(markdown.indexOf("## Machine-Readable Pack"));
  const json = jsonBlock.slice(jsonBlock.indexOf("{"), jsonBlock.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json);

  assert.deepEqual(parsed.renderContract, JSON.parse(JSON.stringify(CM_ASK_RENDER_CONTRACT)));
  assert.equal(
    Object.keys(parsed)[0],
    "renderContract",
    "renderContract must be the first key so it survives response truncation"
  );
});

test("the contract block survives a pack big enough to truncate", () => {
  // A real pack routinely exceeds the 25k character response limit, and
  // truncation drops the whole trailing machine-readable section, so the
  // renderContract field goes with it. The leading markdown block is therefore
  // the copy that has to hold, which is why it sits above the answer.
  const bigPack = {
    ...samplePack,
    citations: Array.from({ length: 20 }, (_, index) => ({
      label: `E${index + 1}`,
      dataPointId: `dp${index + 1}`,
      isCited: true,
    })),
    citedDataPointIds: Array.from({ length: 20 }, (_, index) => `dp${index + 1}`),
    dataPoints: Array.from({ length: 20 }, (_, index) => ({
      label: `E${index + 1}`,
      dataPointId: `dp${index + 1}`,
      origin: "fresh",
      interpretation: `Claim ${index + 1}. ` + "filler words here. ".repeat(200),
      anchorQuote: `Anchor ${index + 1} verbatim.`,
      evidenceType: "statistic",
      source: { title: `Source ${index + 1}`, canonicalUrl: "https://example.com/a" },
    })),
  };

  const markdown = formatAnalystPackMarkdown(bigPack);

  assert.ok(markdown.includes("[Response truncated"), "this fixture must actually truncate");
  assert.match(markdown, /## Render Contract \(follow exactly\)/);
  for (const rule of CM_ASK_RENDER_CONTRACT.rules) {
    assert.ok(markdown.includes(rule), `render contract rule lost to truncation: ${rule}`);
  }
});

test("an oversized pack drops the JSON block whole rather than emitting broken JSON", () => {
  // Sized so the prose fits but prose plus the pack does not, which is the case
  // the fit-or-omit branch exists for.
  const bigPack = {
    ...samplePack,
    positions: Array.from({ length: 2 }, (_, index) => ({
      positionId: `pos${index + 1}`,
      title: `Position ${index + 1}`,
      currentStance: "Stance sentence. ".repeat(420),
      supportingEvidenceCount: 10,
      counterEvidenceCount: 1,
    })),
    dataPoints: Array.from({ length: 12 }, (_, index) => ({
      label: `E${index + 1}`,
      dataPointId: `dp${index + 1}`,
      origin: "fresh",
      interpretation: `Claim ${index + 1}. ` + "filler words. ".repeat(40),
      anchorQuote: `Anchor ${index + 1} verbatim.`,
      evidenceType: "statistic",
      source: { title: `Source ${index + 1}`, canonicalUrl: "https://example.com/a" },
    })),
  };

  const markdown = formatAnalystPackMarkdown(bigPack);

  assert.ok(markdown.length <= 25000, "omitting the pack must bring the response under the cap");

  assert.match(markdown, /Omitted: this pack was too large/);
  assert.equal(
    markdown.includes("```json"),
    false,
    "a partial JSON fence must never be emitted"
  );
  // Threading survives regardless, because it lives in prose above the pack.
  assert.match(markdown, /## Carry Forward/);
  assert.match(markdown, /`dp0`, `dp1`/);
});

test("the contract separates pack labels from position-internal numbering", () => {
  const rules = CM_ASK_RENDER_CONTRACT.rules.join(" ");

  // A live call produced "[E1, cited within P1]" by conflating a position's own
  // evidence numbering with this pack's labels. The contract must forbid it.
  assert.match(rules, /Position stance text carries its own \[E#\] and \[C#\] numbering/);
  assert.match(rules, /hybrid label/);
});

test("the contract bars citing a figure that exists only in stance text", () => {
  const rules = CM_ASK_RENDER_CONTRACT.rules.join(" ");

  // The same live call cited a figure it admitted came from stance prose, and
  // said so inside the brackets. Self-reporting a rule break is still a break:
  // the annotated label resolves to nothing.
  assert.match(rules, /Stance text is not evidence/);
  assert.match(rules, /must never carry a citation label/);
  assert.match(rules, /narrating the break does not repair it/);
});

test("the contract tells the client to relay retrieval notes", () => {
  const rules = CM_ASK_RENDER_CONTRACT.rules.join(" ");

  assert.match(rules, /Retrieval Notes/);
});

test("the pack names the project every item is scoped to", () => {
  const markdown = formatAnalystPackMarkdown({
    ...samplePack,
    context: {
      projectId: "kn78389qvtsg4xp3vtjdrfy22x8c563e",
      projectName: "Earnestly Competitive Landscape",
      summary: "No narrower scope is active.",
    },
  });

  assert.match(markdown, /\*\*Project scope:\*\* Earnestly Competitive Landscape/);
  assert.match(markdown, /kn78389qvtsg4xp3vtjdrfy22x8c563e/);
  assert.ok(
    markdown.indexOf("Project scope:") < markdown.indexOf("## Answer"),
    "the project scope must be stated before the answer it applies to"
  );
});

test("retrieval notes are surfaced above the answer and repeated in the pack", () => {
  const markdown = formatAnalystPackMarkdown({
    ...samplePack,
    warnings: [
      "Project scope held: 8 retrieved item(s) belonged to a different project and were excluded before the answer was composed.",
      "Malformed citation label [E1, cited within P1]. Citation labels must be written as a bare [E followed by digits].",
    ],
  });

  assert.match(markdown, /## Retrieval Notes/);
  assert.match(markdown, /- Project scope held: 8 retrieved item\(s\)/);
  assert.match(markdown, /- Malformed citation label \[E1, cited within P1\]/);
  assert.ok(
    markdown.indexOf("## Retrieval Notes") < markdown.indexOf("## Answer"),
    "retrieval notes must be readable before the answer they qualify"
  );
  assert.match(markdown, /"warnings": \[/);
});

test("a clean answer carries no retrieval notes section", () => {
  const markdown = formatAnalystPackMarkdown(samplePack);

  assert.equal(
    markdown.includes("## Retrieval Notes"),
    false,
    "notes must appear only when there is something to report"
  );
});

test("the cm_ask tool description states the render contract", () => {
  const description = getCmAskDescription();

  assert.match(description, /[Rr]ender contract/);
  assert.match(description, /renderContract/);
  assert.match(description, /Stance first/i);
  assert.match(description, /\[E1\]/);
  assert.match(description, /source reference list/i);
});
