# Hosted MCP Beta

Purpose: this document explains the invite-only hosted MCP beta for Curate Mind, including tester setup, rate limits, visible lineage, and the owner's testing loop for the public research-pack tool.

## What Beta Testers Get

Beta testers connect their own Claude or Codex client to Curate Mind's hosted MCP server:

```text
https://mcp.curatemind.io/mcp
```

The hosted server is read-only. It lets a tester's AI assistant retrieve Curate Mind research context, then the tester's own Claude or Codex session does the reasoning and writing.

The public beta tool shape is:

```text
cm_get_research_pack
```

The tool returns citation-ready context:

- relevant research positions
- data points and claim text
- short anchor quotes
- source metadata
- original source links
- enough IDs and labels for the assistant to cite the lineage from answer to evidence to source

The public beta does not expose:

- source ingestion
- extraction or enrichment tools
- profile editing
- admin or repair tools
- full source text dumps
- server-side answer generation with Curate Mind's model keys

## Beta Account Model

Each beta tester gets one invite account and one bearer token.

The token identifies the tester for usage tracking and rate limits. It should be treated like a password and not posted in public chats, GitHub issues, screenshots, or shared config files.

Curate Mind stores beta accounts and usage logs in Convex.

Owner command for creating an account after the hosted functions are deployed:

```bash
cd mcp
npm run beta:create -- --email=user@example.com --name="User Name" --projectId=YOUR_CONVEX_PROJECT_ID
```

The command prints the raw token once. Save it before closing the terminal output.

## Rate Limits

Initial beta limits:

| Limit | Value |
|---|---:|
| Calls per tester per day | 20 |
| Calls per tester per hour | 5 |
| Active calls per tester | 1 |
| Global daily beta cap | 200 |

Plain-language version for testers:

> The beta is intentionally rate-limited while we learn. Each account can make up to 20 research-pack calls per day, up to 5 per hour, with one active request at a time. If the beta reaches the global daily cap, requests may pause until the next day.

## What Costs Whose Account

The tester's Claude or Codex subscription/API usage pays for the final answer generation inside their AI client.

Curate Mind pays only for the hosted retrieval layer:

- Replit hosting
- Convex reads, actions, and vector search
- small embedding cost for semantic query retrieval
- data egress for MCP responses

This is why the public beta exposes a research pack rather than the current curator-facing `cm_ask` answer generator.

## Setup For Claude Code

Claude Code supports remote HTTP MCP servers with bearer-token headers.

Give the tester:

- MCP URL: `https://mcp.curatemind.io/mcp`
- their token: `YOUR_BETA_TOKEN`

Tester command:

```bash
claude mcp add --transport http curate-mind https://mcp.curatemind.io/mcp \
  --header "Authorization: Bearer YOUR_BETA_TOKEN"
```

Check that Claude sees the server:

```bash
claude mcp list
```

Inside Claude Code, the tester can also run:

```text
/mcp
```

Starter prompt:

```text
Use Curate Mind to get a research pack for this question, then answer with clear citations and source links:

What does the research show about AI adoption barriers inside established companies?
```

## Setup For Claude Cowork Or Claude.ai

Use this path when the tester is connecting through a Claude web or Cowork interface that supports custom MCP connectors.

Connection values:

| Field | Value |
|---|---|
| Name | Curate Mind |
| Transport | HTTP or Streamable HTTP |
| URL | `https://mcp.curatemind.io/mcp` |
| Header name | `Authorization` |
| Header value | `Bearer YOUR_BETA_TOKEN` |

Starter prompt:

```text
Use Curate Mind to retrieve a research pack for this question before answering. Cite the returned evidence labels and include original source links where useful:

What does the research show about AI adoption barriers inside established companies?
```

If the Claude interface does not show a custom MCP connector option, use Claude Code for the beta test or ask for help confirming whether the feature is enabled on that account.

## Setup For Codex

Codex supports Streamable HTTP MCP servers in `config.toml`.

Set the token as an environment variable:

```bash
export CURATE_MIND_MCP_TOKEN="YOUR_BETA_TOKEN"
```

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.curate_mind]
url = "https://mcp.curatemind.io/mcp"
bearer_token_env_var = "CURATE_MIND_MCP_TOKEN"
tool_timeout_sec = 60
```

In Codex, check MCP status with:

```text
/mcp
```

Starter prompt:

```text
Use the Curate Mind MCP server to retrieve a research pack for this question, then write a cited answer with claim-to-source lineage:

What does the research show about AI adoption barriers inside established companies?
```

## What A Good Answer Should Look Like

A good answer should:

- start with the current stance or pattern, not raw evidence
- cite positions or evidence labels returned by Curate Mind
- include short evidence explanations
- include original source links where claims need verification
- distinguish what the corpus says from what the assistant is inferring
- say when the retrieved evidence is thin or mixed

A bad answer:

- gives broad AI commentary without using Curate Mind evidence
- cites source titles without explaining the claim they support
- invents citations or source links
- quotes long passages from source text
- treats a single data point as the whole corpus view

## Owner Testing Loop

Use this loop before inviting more testers.

1. Create a small golden question set.

   Start with 10 questions:

   - 3 questions where you already know the corpus has strong answers
   - 2 questions about specific themes or positions
   - 2 questions where source lineage matters
   - 1 question that should return mixed or counter evidence
   - 1 question that is intentionally vague
   - 1 question that should say the corpus is thin

2. Run each question in your own Claude or Codex account.

   Ask the assistant to retrieve a Curate Mind research pack first, then write the answer. Save the question, the research pack summary, and the final answer.

3. Score the result.

   Use this simple rubric:

   | Check | Pass condition |
   |---|---|
   | Relevance | Most returned evidence directly helps answer the question |
   | Coverage | The pack includes positions plus supporting evidence where available |
   | Lineage | Claims can be traced to data points and original source links |
   | Source links | Links open or point to the right original source |
   | No leakage | The tool does not return full source text |
   | Answer quality | The user's assistant can write a useful answer from the pack |
   | Honesty | Thin or mixed evidence is described honestly |

4. Note failures as product issues.

   Common failure types:

   - search miss: relevant evidence exists but was not retrieved
   - noisy retrieval: too many weakly related data points
   - missing stance: evidence appears but no current position is returned
   - weak lineage: source link or anchor quote is missing
   - oversized pack: the response is too long for comfortable use
   - answer misuse: the assistant ignored the pack or invented context

5. Iterate one thing at a time.

   Good first adjustments:

   - change the default evidence limit
   - tune how positions are selected
   - tune semantic retrieval ranking
   - add a theme or source scope argument
   - improve the tool description so Claude/Codex uses the pack correctly

## Beta Tester Feedback Template

Ask testers to send feedback in this format:

```text
Question I asked:

AI client used:
Claude Code / Claude Cowork / Codex / Other

Did it answer well?
Yes / Partly / No

What was missing or wrong?

Did the source links help you verify the answer?
Yes / Partly / No

Any confusing setup or rate-limit issues?
```

## Troubleshooting

If the MCP server does not appear:

- confirm the token was copied exactly
- confirm the URL is `https://mcp.curatemind.io/mcp`
- check Claude with `claude mcp list` or Codex with `/mcp`
- remove and re-add the server if the token changed

If requests are rejected:

- the token may be disabled or wrong
- the account may have hit 5 calls/hour or 20 calls/day
- the beta may have hit the 200 calls/day global cap

If answers do not use Curate Mind evidence:

- explicitly ask the assistant to call `cm_get_research_pack` first
- ask it to cite returned labels and include original source links
- lower the question scope by naming a theme, position, or source if known
