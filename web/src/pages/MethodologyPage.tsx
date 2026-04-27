import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { GitHubIcon } from "@/components/GitHubIcon";
import { LivePositionDemo } from "@/components/LivePositionDemo";
import { FLAGSHIP_POSITION_ID, GITHUB_URL } from "@/config/homepage";

/**
 * MethodologyPage explains the research method, walked through with a real
 * article from the corpus. Structure:
 *
 *   Hero (problem + promise)
 *   Workflow strip (four anchor-linked step cards)
 *   Steps 01, 02, 03 (curate, extract, connect)
 *   Live demo band (legend, flagship position demo, compact layer note)
 *   Step 04 (version, with a v1→v2 timeline from Convex history)
 *   MCP section (how the system is actually driven)
 *   Footer
 */

const HBR_URL =
  "https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it";

export default function MethodologyPage() {
  // Same flagship the home page uses, so readers see a consistent demo.
  const flagshipId = FLAGSHIP_POSITION_ID;

  return (
    <div className="bg-primary">
      {/* Hero on brand-tinted band, matching home page treatment */}
      <section className="bg-brand-section_subtle">
        <div className="mx-auto max-w-3xl px-6 pt-8 pb-12 text-center lg:pb-16">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            Methodology
          </p>
          <h1 className="mx-auto mt-5 max-w-2xl text-display-lg font-semibold tracking-[-0.025em] text-primary">
            A verifiable research base, built one source at a time.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-secondary">
            The usual choices: skim summaries you can&apos;t verify, or read
            the full source you don&apos;t have time for. Curate Mind sits
            between, with every claim traceable to the exact sentence in
            the source.
          </p>
        </div>
      </section>

      {/* Workflow visual: four cards connected by arrows. Each card is a
          bold visual anchor and links to its corresponding step section. */}
      <nav
        aria-label="Method overview"
        className="mx-auto max-w-5xl px-6 pt-14"
      >
        <ol className="flex flex-col items-stretch gap-3 sm:flex-row sm:gap-2">
          <FlowCard
            step="01"
            title="Curate"
            body="Pick the sources worth keeping. An opinionated cut from each week's scan."
            href="#step-01"
          />
          <FlowArrow />
          <FlowCard
            step="02"
            title="Extract"
            body="Abstract each source into data points. Every claim anchored to its exact words."
            href="#step-02"
          />
          <FlowArrow />
          <FlowCard
            step="03"
            title="Connect"
            body="Attach data points to research positions. Stances built from evidence, not summaries."
            href="#step-03"
          />
          <FlowArrow />
          <FlowCard
            step="04"
            title="Version"
            body="Update positions as evidence shifts. Older versions stay in the history."
            href="#step-04"
          />
        </ol>
      </nav>

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
            on. After that, I&apos;m watching for two patterns: a topic or
            finding that shows up across multiple sources, which tells me a
            real signal is forming in the field; or a genuinely novel angle
            that nothing else in the corpus is tracking yet. Sometimes a
            credible thinker earns a slot on credibility alone, with the
            patterns surfacing on a later weekly pass.
          </p>
          <p>
            The corpus is biased on purpose. My background is in Product
            Design and Human-Centered Design, so sources that speak to how
            AI is reshaping design, or how it is meaningfully changing
            people&apos;s lives, weigh heavier. A different curator would
            keep a different set. That is the point. A curated research
            base is a point of view made queryable.
          </p>
          <ExampleCallout
            label="Example source"
            title="AI Doesn't Reduce Work — It Intensifies It"
            meta="Harvard Business Review · Aruna Ranganathan and Xingqi Maggie Ye · Feb 2026 · 1,736 words"
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
          <p>
            This one article produced roughly a dozen data points; three
            are shown below. Longer reports produce fifty or more.
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
            that support it, the ones that challenge it, and the curator&apos;s
            observations that connect them.
          </p>
          <p>
            Below is a working position from the{" "}
            <em>AI Productivity and Workforce Impact</em> theme. It holds that
            complex knowledge work benefits more from AI than simple tasks,
            even after adjusting for lower success rates. The HBR data points
            from Step 02 attach to a related position in the same theme, on
            work intensification.
          </p>
        </Step>
      </div>

      {/* Live demo on an off-white band, framed only by a quiet caption
          and a small color legend. The demo is the visual payoff of
          Step 03; the caption stays out of its way. */}
      <section className="mt-10 bg-secondary py-12 lg:py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            How to read this
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-tertiary">
            Click a citation in the left column to jump to its data point on
            the right. Click a data point on the right to find its citation
            on the left. Click Open original to view the underlying source.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <LegendChip variant="support" label="Supporting evidence" />
            <LegendChip variant="counter" label="Counter evidence" />
            <LegendChip variant="also" label="Also attached" />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl px-6">
          <LivePositionDemo positionId={flagshipId} />
        </div>
      </section>

      {/* Step 4 lives after the demo so the reader sees the thing that
          gets versioned before learning how versioning works. */}
      <div className="mx-auto max-w-3xl px-6">
        <Step
          number="04"
          title="Version positions over time"
          tagline="Positions are append-only. Each update writes a new version; older versions stay readable."
        >
          <p>
            Research doesn&apos;t stand still. A new source can reinforce,
            qualify, or contradict an existing position. When that happens,
            the position gets a new version, and the old version stays in
            the history, readable.
          </p>

          <VersionTimeline />

          <p>
            Being able to trace a stance back through its versions, and to
            see when the evidence base expanded, is part of what a research
            base is for.
          </p>
        </Step>
      </div>

      {/* What using it actually looks like (MCP) */}
      <section className="mx-auto mt-16 max-w-3xl px-6">
        <div className="border-t border-secondary pt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-primary">
            What using it actually looks like
          </h2>

          <div className="mt-5 space-y-4 text-base leading-7 text-secondary">
            <p>
              Curate Mind is not maintained through this front end. The
              curation, extraction, position updates, and question answering
              all happen on the other side, inside Claude or the Codex
              desktop app, through a Model Context Protocol server that
              writes directly to the same Convex backend this front end
              reads from.
            </p>
            <p>
              The front end you are reading is the verification layer. It
              shows what has been captured and how the pieces connect; the
              capturing itself happens elsewhere.
            </p>
            <p>A few representative tools, named in plain language:</p>
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

      {/* Footer — same deep brand as open source section on home page */}
      <footer className="mt-16 bg-brand-section">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 border-t border-white/10 px-6 py-8 text-center text-sm text-tertiary_on-brand sm:flex-row sm:justify-between sm:text-left">
          <p>
            Curate Mind &middot; built by Maicol Parker-Chavez &middot;{" "}
            {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-5">
            <Link to="/" className="transition hover:text-primary_on-brand">
              Home
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-primary_on-brand"
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
  href,
}: {
  step: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <li className="flex-1">
      <a
        href={href}
        className="group flex h-full flex-col items-start gap-2 rounded-2xl border border-secondary bg-primary px-5 py-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition duration-150 ease-linear hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_6px_16px_rgba(16,24,40,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-secondary">
          Step {step}
        </p>
        <p className="text-3xl font-bold tracking-[-0.02em] text-primary">
          {title}
        </p>
        <p className="mt-1 text-sm leading-6 text-tertiary">{body}</p>
      </a>
    </li>
  );
}

function FlowArrow() {
  return (
    <li
      className="hidden shrink-0 items-center text-fg-brand-secondary sm:flex"
      aria-hidden="true"
    >
      <ArrowRight className="size-5" strokeWidth={2.5} />
    </li>
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
    <section
      id={`step-${number}`}
      className="scroll-mt-24 border-t border-secondary py-12 first:border-t-0 first:pt-8"
    >
      <div className="flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
        <span className="font-mono text-quaternary">{number}</span>
        <span>Step</span>
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-primary">
        {title}
      </h2>
      <p className="mt-2 text-base leading-7 text-tertiary">{tagline}</p>
      <div className="mt-6 space-y-4 text-base leading-7 text-secondary">
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
    <aside className="mt-6 rounded-2xl border border-secondary bg-secondary p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
        {label}
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold leading-7 text-primary">
          {title}
        </h3>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-tertiary transition hover:text-primary"
          aria-label="Open source"
        >
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      <p className="mt-1 text-xs text-tertiary">{meta}</p>
      <div className="mt-3 text-sm leading-6 text-secondary">{children}</div>
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
    <article className="overflow-hidden rounded-2xl border border-secondary bg-primary p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge type="color" size="sm" color="gray">
          {label}
        </Badge>
        <Badge type="color" size="sm" color="brand">
          {evidenceType}
        </Badge>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-primary px-2 py-0.5 text-xs font-medium text-success-primary">
          <span
            className="size-1.5 rounded-full bg-success-solid"
            aria-hidden="true"
          />
          {confidence}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-7 text-primary">
        {claim}
      </h3>
      <blockquote className="mt-3 rounded-xl border border-secondary bg-secondary px-4 py-3 text-sm leading-6 text-secondary">
        &ldquo;{anchorQuote}&rdquo;
      </blockquote>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-secondary bg-primary px-2 py-0.5 text-xs text-tertiary"
          >
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function LegendChip({
  variant,
  label,
}: {
  variant: "support" | "counter" | "also";
  label: string;
}) {
  const dotClass =
    variant === "support"
      ? "bg-success-solid"
      : variant === "counter"
      ? "bg-warning-solid"
      : "bg-quaternary";
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-secondary">
      <span className={`size-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * VersionTimeline — shows v1 → v2 of the flagship position, sourced from
 * Convex history. The pedagogical point is that v1 → v2 changed the
 * evidence base (2 → 10 supporting, 0 → 2 counter) while leaving the
 * stance text unchanged. Later versions (shown in the footer) sharpened
 * the prose and promoted confidence to active.
 */
function VersionTimeline() {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-secondary bg-primary shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="border-b border-secondary bg-secondary_subtle px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
          Version history
        </p>
        <p className="mt-1 text-sm font-semibold text-primary">
          Complex tasks yield greater AI speedups but lower success rates
        </p>
      </div>

      <div className="bg-secondary_subtle px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
          Stance (unchanged between v1 and v2)
        </p>
        <blockquote className="mt-2 text-sm leading-6 text-secondary">
          &ldquo;AI provides 9-12x speedups on college-level tasks vs.
          lower-complexity work, but success rates decline with task
          complexity. This is the central tradeoff constraining AI
          productivity claims.&rdquo;
        </blockquote>
      </div>

      <div className="divide-y divide-secondary">
        <VersionRow
          version="v1"
          date="Mar 22, 2026"
          confidence="Emerging"
          supporting={2}
          counter={0}
          supportDelta={null}
          counterDelta={null}
          note="Initial save. Two data points attached from the first pass."
        />
        <VersionRow
          version="v2"
          date="Mar 24, 2026"
          confidence="Emerging"
          supporting={10}
          counter={2}
          supportDelta={8}
          counterDelta={2}
          note="Evidence linking Batch 2: eight supporting data points and two counter-evidence data points added from tags ai-productivity-impact and task-complexity-reliability."
        />
      </div>

      <div className="border-t border-secondary bg-secondary_subtle px-5 py-3">
        <p className="text-xs leading-5 text-tertiary">
          The stance text did not change between v1 and v2. Only the
          evidence base grew. The position is now on version 8, with the
          prose sharpened and confidence promoted to active along the way.
        </p>
      </div>
    </div>
  );
}

function VersionRow({
  version,
  date,
  confidence,
  supporting,
  counter,
  supportDelta,
  counterDelta,
  note,
}: {
  version: string;
  date: string;
  confidence: string;
  supporting: number;
  counter: number;
  supportDelta: number | null;
  counterDelta: number | null;
  note: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-semibold text-primary">
          {version}
        </span>
        <span className="text-xs text-tertiary">{date}</span>
        <span className="inline-flex items-center rounded-full border border-secondary px-2 py-0.5 text-xs text-secondary">
          {confidence}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <EvidenceCount
          variant="support"
          label="supporting"
          count={supporting}
          delta={supportDelta}
        />
        <EvidenceCount
          variant="counter"
          label="counter"
          count={counter}
          delta={counterDelta}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-tertiary">{note}</p>
    </div>
  );
}

function EvidenceCount({
  variant,
  label,
  count,
  delta,
}: {
  variant: "support" | "counter";
  label: string;
  count: number;
  delta: number | null;
}) {
  const dotClass =
    variant === "support" ? "bg-success-solid" : "bg-warning-solid";
  const deltaClass =
    variant === "support" ? "text-success-primary" : "text-warning-primary";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-secondary">
      <span className={`size-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {count} {label}
      {delta !== null && delta > 0 ? (
        <span className={`text-xs font-medium ${deltaClass}`}>+{delta}</span>
      ) : null}
    </span>
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
      <code className="rounded-md bg-tertiary px-2 py-0.5 font-mono text-sm text-primary">
        {name}
      </code>
      <span className="text-sm text-tertiary">{description}</span>
    </li>
  );
}
