import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { GitHubIcon } from "@/components/GitHubIcon";
import { LivePositionDemo } from "@/components/LivePositionDemo";
import { FLAGSHIP_POSITION_ID, GITHUB_URL } from "@/config/homepage";

/**
 * MethodologyPage — explains how the research method works, walked
 * through with a real article from the corpus. Structure:
 *
 *   Hero → Workflow visual → Steps 01-04 (how research is made)
 *   → Depth on your terms (how you read it, with the live demo inline)
 *   → What using it actually looks like (MCP section, user-experience framing)
 *   → Footer
 */

const HBR_URL =
  "https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it";

export default function MethodologyPage() {
  // Same flagship the home page uses, so readers see a consistent demo.
  const flagshipId = FLAGSHIP_POSITION_ID;

  return (
    <div className="pt-8">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-12 text-center lg:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Methodology
        </p>
        <h1 className="mx-auto mt-5 max-w-2xl text-display-md font-semibold tracking-[-0.02em] text-slate-950">
          How the research gets made.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600">
          The method behind Curate Mind, walked through with a real article
          from the corpus.
        </p>
      </section>

      {/* Workflow visual — four pill cards connected by arrows */}
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex items-stretch justify-between gap-2">
          <FlowCard step="01" title="Curate" body="Choose what makes it in" />
          <FlowArrow />
          <FlowCard step="02" title="Extract" body="Claims with anchor quotes" />
          <FlowArrow />
          <FlowCard step="03" title="Connect" body="Evidence to positions" />
          <FlowArrow />
          <FlowCard step="04" title="Version" body="Append-only over time" />
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto mt-4 max-w-3xl px-6">
        {/* Step 1 */}
        <Step
          number="01"
          title="Curate sources"
          tagline="The first act of research is deciding which sources are worth keeping."
        >
          <p>
            Every week I scan between twenty and sixty sources: articles,
            reports, podcasts, research papers, blog posts, videos. What gets
            kept is an opinionated cut.
          </p>
          <p>
            Credibility comes first. The source has to be worth spending time
            on. After that, I'm watching for two patterns. One, a topic or
            finding that shows up across multiple sources, which tells me a
            real signal is forming in the field. Two, a genuinely novel angle
            that nothing else in the corpus is tracking yet.
          </p>
          <p>
            Sometimes I pull a source in simply because the thinker is
            credible, then let a weekly pass through Claude surface the
            patterns that connect it to the rest of what I've gathered.
            Analysis shapes curation in both directions.
          </p>
          <p>
            The corpus is biased on purpose. My background is in Product
            Design and Human-Centered Design, so sources that speak to how
            AI is reshaping design, or how it is meaningfully changing
            people's lives, weigh heavier. A different curator would keep a
            different set. That is the point. A curated research base is a
            point of view made queryable.
          </p>
          <ExampleCallout
            label="Example source"
            title="AI Doesn't Reduce Work — It Intensifies It"
            meta="Harvard Business Review · Aruna Ranganathan and Xingqi Maggie Ye · Feb 2026 · 1,736 words · Tier 2"
            url={HBR_URL}
          >
            <p>
              An eight-month study of a 200-person tech company found that
              generative AI tools did not reduce workload. Workers
              voluntarily took on more tasks, blurred the boundary between
              work and non-work, and juggled more threads in parallel.
              Counter-narrative to the dominant "AI saves time" story.
            </p>
          </ExampleCallout>
        </Step>

        {/* Step 2 */}
        <Step
          number="02"
          title="Extract claims as data points"
          tagline="Each claim gets lifted out with a verbatim quote, a confidence level, and tags."
        >
          <p>
            Once a source is in, it gets read carefully and broken down into{" "}
            <strong>data points</strong>. A data point is one claim from the
            source, paired with the exact words that support it (the{" "}
            <em>anchor quote</em>), a confidence level, the type of evidence,
            and a few tags that help it surface later.
          </p>
          <p>
            The anchor quote matters most. It means every claim can be
            checked against the source word for word. Claims that cannot be
            anchored do not get saved.
          </p>

          <div className="mt-6 space-y-4">
            <DataPointExample
              label="E1"
              evidenceType="Observation"
              confidence="Strong"
              claim="AI tools consistently intensified work rather than reducing it. Workers voluntarily took on more, worked faster, and extended work into more hours of the day."
              anchorQuote="we discovered that AI tools didn't reduce work, they consistently intensified it"
              tags={["work-intensification", "ai-adoption-patterns", "productivity-paradox"]}
            />
            <DataPointExample
              label="E2"
              evidenceType="Framework"
              confidence="Strong"
              claim="Task expansion: because AI fills in gaps in knowledge, workers step into responsibilities that previously belonged to others. PMs write code, researchers do engineering."
              anchorQuote="Product managers and designers began writing code; researchers took on engineering tasks"
              tags={["task-expansion", "role-blurring", "ai-productivity"]}
            />
            <DataPointExample
              label="E3"
              evidenceType="Framework"
              confidence="Moderate"
              claim="A self-reinforcing cycle emerges. AI acceleration raises speed expectations, which increases reliance on AI, which widens the scope of what workers attempt."
              anchorQuote="AI accelerated certain tasks, which raised expectations for speed; higher speed made workers more reliant on AI"
              tags={["productivity-paradox", "cognitive-load", "ai-practice"]}
            />
          </div>

          <p className="mt-6">
            This one article produced roughly a dozen data points. A longer
            report can produce fifty. Each one is a small unit of evidence
            that can later be combined with claims from other sources.
          </p>
        </Step>

        {/* Step 3 */}
        <Step
          number="03"
          title="Connect claims to research positions"
          tagline="Data points aggregate into positions. A position is a versioned thesis on a specific question."
        >
          <p>
            The corpus is organized by <strong>research themes</strong>{" "}
            (broad ongoing questions) and <strong>research positions</strong>{" "}
            (specific stances within a theme). A position states where the
            research currently sits on a question, and lists the data points
            that support it, the ones that challenge it, and the curator's
            observations that connect them.
          </p>
          <p>
            The HBR data points above support a position in the{" "}
            <em>AI Productivity &amp; Workforce Impact</em> theme on whether
            AI reduces or intensifies workload at the employee level. They
            sit alongside data points from other sources across the theme.
          </p>
        </Step>

        {/* Step 4 */}
        <Step
          number="04"
          title="Version positions over time"
          tagline="Positions are append-only. Each update writes a new version; older versions stay readable."
        >
          <p>
            Research does not stand still. A new source can reinforce,
            qualify, or contradict an existing position. When that happens,
            the position gets a new version, and the old version stays in
            the history. A stance can be watched evolving from week to week,
            month to month, quarter to quarter.
          </p>
          <p>
            Research is a practice, not a one-time deliverable. Being able
            to trace a stance back through its versions is part of what a
            research base is for.
          </p>
        </Step>
      </div>

      {/* Depth on your terms — Layers + embedded live demo */}
      <section className="mx-auto mt-4 max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <div className="border-t border-slate-200 pt-12">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-slate-950">
              Depth on your terms
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Not every claim needs the same depth. Curate Mind exposes four
              layers between a theme and the words in the original source.
              You do not have to read every article to trust the research,
              but if a claim matters enough to check, the path all the way
              down is always open.
            </p>

            <ul className="mt-6 space-y-3 text-slate-700">
              <LayerRow
                layer="Layer 1"
                title="Themes & Positions"
                description="Summaries. Most questions are answered here."
              />
              <LayerRow
                layer="Layer 2"
                title="Evidence"
                description="Data points, curator observations, mental models."
              />
              <LayerRow
                layer="Layer 3"
                title="Verbatim quotes"
                description="The exact language used in the source, for when the wording matters."
              />
              <LayerRow
                layer="Layer 4"
                title="Full source"
                description="The original article or report, for when you want to read it end to end."
              />
            </ul>

            <p className="mt-6 text-sm text-slate-500">
              Try it. Click a citation in the stance below to see the data
              point behind the claim. Click a data point to find its
              citation in the stance.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <LivePositionDemo positionId={flagshipId} />
        </div>
      </section>

      {/* What using it actually looks like (MCP) */}
      <section className="mx-auto mt-16 max-w-3xl px-6">
        <div className="border-t border-slate-200 pt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-slate-950">
            What using it actually looks like
          </h2>

          <div className="mt-5 space-y-4 text-base leading-7 text-slate-700">
            <p>
              Curate Mind is not maintained through this front end. The
              curation, extraction, position updates, and question answering
              all happen on the other side, inside Claude or the Codex
              desktop app.
            </p>
            <p>
              A typical session: I open a conversation, hand it a URL, and
              the four steps above run as tool calls to a Model Context
              Protocol server that writes directly to the same Convex
              backend this front end reads from. An article becomes a
              source. A pass through it produces data points with anchor
              quotes. Those data points get attached to a position, which
              writes a new version. Asking a question routes back through
              the same corpus, with an answer that carries its sources
              inline.
            </p>
            <p>
              The front end you are reading is the verification layer. It
              shows what has been captured and how the pieces connect, but
              the capturing itself happens elsewhere.
            </p>
            <p>
              A few representative tools, named in plain language:
            </p>
            <ul className="space-y-2">
              <ToolRow
                name="cm_add_source_from_url"
                description="Ingest a source from a URL. Step 01."
              />
              <ToolRow
                name="cm_save_data_points"
                description="Save extracted claims with their anchor quotes and tags. Step 02."
              />
              <ToolRow
                name="cm_update_position"
                description="Append a new version of a research position. Steps 03 and 04."
              />
              <ToolRow
                name="cm_enrich_data_point"
                description="Refine a data point with a curator note, updated tags, or a new confidence level."
              />
            </ul>
            <p>
              The full tool reference, installation steps, and extraction
              pipeline design all live in the GitHub repository.
            </p>
          </div>
          <div className="mt-6">
            <Button
              size="md"
              color="primary"
              iconLeading={GitHubIcon}
              iconTrailing={ArrowUpRight}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              View the full setup on GitHub
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-slate-500 sm:flex-row sm:justify-between sm:text-left">
          <p>
            Curate Mind &middot; built by Maicol Parker-Chavez &middot;{" "}
            {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-5">
            <Link to="/" className="transition hover:text-slate-900">
              Home
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-slate-900"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Supporting components ── */

function FlowCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        Step {step}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      className="flex shrink-0 items-center text-slate-300"
      aria-hidden="true"
    >
      <ArrowRight className="size-4" />
    </div>
  );
}

function Step({
  number,
  title,
  tagline,
  children,
}: {
  number: string;
  title: string;
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 py-12 first:border-t-0 first:pt-8">
      <div className="flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        <span className="font-mono text-slate-400">{number}</span>
        <span>Step</span>
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-slate-950">
        {title}
      </h2>
      <p className="mt-2 text-base leading-7 text-slate-600">{tagline}</p>
      <div className="mt-6 space-y-4 text-base leading-7 text-slate-700">
        {children}
      </div>
    </section>
  );
}

function ExampleCallout({
  label,
  title,
  meta,
  url,
  children,
}: {
  label: string;
  title: string;
  meta: string;
  url: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold leading-7 text-slate-950">
          {title}
        </h3>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-slate-500 transition hover:text-slate-800"
          aria-label="Open source"
        >
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
      <div className="mt-3 text-sm leading-6 text-slate-700">{children}</div>
    </aside>
  );
}

function DataPointExample({
  label,
  evidenceType,
  confidence,
  claim,
  anchorQuote,
  tags,
}: {
  label: string;
  evidenceType: string;
  confidence: string;
  claim: string;
  anchorQuote: string;
  tags: string[];
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge type="color" size="sm" color="gray">
          {label}
        </Badge>
        <Badge type="color" size="sm" color="brand">
          {evidenceType}
        </Badge>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <span
            className="size-1.5 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          {confidence}
        </span>
      </div>
      <h4 className="mt-3 text-base font-semibold leading-7 text-slate-900">
        {claim}
      </h4>
      <blockquote className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
        &ldquo;{anchorQuote}&rdquo;
      </blockquote>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500"
          >
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function LayerRow({
  layer,
  title,
  description,
}: {
  layer: string;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-baseline gap-4">
      <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {layer}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </li>
  );
}

function ToolRow({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-3">
      <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-900">
        {name}
      </code>
      <span className="text-sm text-slate-600">{description}</span>
    </li>
  );
}
