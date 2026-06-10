#!/usr/bin/env node
/**
 * Smoke-test the hosted public MCP endpoint.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.CURATE_MIND_MCP_URL ?? "http://127.0.0.1:3333/mcp";
const token = process.env.CURATE_MIND_MCP_TOKEN;

if (!token) {
  console.error("CURATE_MIND_MCP_TOKEN is required.");
  process.exit(1);
}

const question =
  process.env.CURATE_MIND_SMOKE_QUESTION ??
  "What does the research show about AI adoption barriers inside established companies?";

const client = new Client({
  name: "curate-mind-public-smoke-test",
  version: "1.0.0",
});

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((tool) => tool.name).join(", "));

  const result = await client.callTool({
    name: "cm_get_research_pack",
    arguments: {
      question,
      limit: 5,
    },
  });

  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");

  const parsed = JSON.parse(text);
  console.log(
    JSON.stringify(
      {
        question: parsed.question,
        project: parsed.project?.name,
        positions: parsed.positions?.length ?? 0,
        evidence: parsed.evidence?.length ?? 0,
        firstEvidence: parsed.evidence?.[0]
          ? {
              label: parsed.evidence[0].label,
              claimText: parsed.evidence[0].claimText,
              sourceTitle: parsed.evidence[0].source?.title,
              originalUrl: parsed.evidence[0].source?.originalUrl,
              anchorLink: parsed.evidence[0].source?.anchorLink,
            }
          : null,
      },
      null,
      2
    )
  );
} finally {
  await client.close();
}
