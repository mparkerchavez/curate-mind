import {
  ArrowRight,
  BookOpen01,
  Compass01,
  File02,
  Folder,
  HomeLine,
  LayersThree01,
  MessageChatCircle,
  SearchLg,
} from "@untitledui/icons";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import DataPointCard, { DataPointForCard } from "@/components/DataPointCard";
import SourceBadge from "@/components/SourceBadge";
import { useProject } from "@/ProjectContext";
import { api, Id } from "@/api";
import { cn } from "@/lib/cn";

type RouteKind = "home" | "theme" | "position" | "source" | "ask";
type PaneMode = "main" | "evidence" | "chat";

type ChatCitation = {
  label: string;
  dataPointId: string;
  order: number;
  isCited: boolean;
};

type AssistantAnswer = {
  question: string;
  answer: string;
  citations: ChatCitation[];
  citedDataPointIds: string[];
  retrievedDataPoints: DataPointForCard[];
  scopeLabel: string;
};

type Turn =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      answerState: AssistantAnswer;
    };

type EvidenceSection = {
  key: string;
  title: string;
  subtitle: string;
  items: DataPointForCard[];
  variant?: "support" | "counter";
  cited?: boolean;
};

const USER_TURN_LIMIT = 4;

export default function WorkspacePage() {
  const { projectId, projectName, loading } = useProject();
  const location = useLocation();
  const { themeId, positionId, sourceId } = useParams<{
    themeId?: string;
    positionId?: string;
    sourceId?: string;
  }>();

  const routeKind = getRouteKind(location.pathname);
  const themeRecordId = themeId as Id<"researchThemes"> | undefined;
  const positionRecordId = positionId as Id<"researchPositions"> | undefined;
  const sourceRecordId = sourceId as Id<"sources"> | undefined;

  const askGrounded = useAction(api.chat.askGrounded);
  const themes = useQuery(
    api.positions.getThemes,
    projectId ? { projectId } : "skip",
  );
  const allPositions = useQuery(api.positions.listAllPositions, projectId ? {} : "skip");
  const themePositions = useQuery(
    api.positions.getPositionsByTheme,
    themeRecordId ? { themeId: themeRecordId } : "skip",
  );
  const positionDetail = useQuery(
    api.positions.getPositionDetail,
    positionRecordId ? { positionId: positionRecordId } : "skip",
  );
  const sourceDetail = useQuery(
    api.sources.getSourceDetail,
    sourceRecordId ? { sourceId: sourceRecordId } : "skip",
  );

  const activeTheme =
    themes?.find((theme: any) => String(theme._id) === themeId) ?? positionDetail?.theme ?? null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeAnswer, setActiveAnswer] = useState<AssistantAnswer | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<PaneMode>("main");

  useEffect(() => {
    setActiveAnswer(null);
    setHighlightedEvidenceId(null);
    setError(null);
    setMobilePane("main");
  }, [location.pathname, location.search]);

  const scopeArgs = useMemo(() => {
    if (sourceRecordId) return { sourceId: sourceRecordId };
    if (positionRecordId) return { positionId: positionRecordId };
    if (themeRecordId) return { themeId: themeRecordId };
    return {};
  }, [positionRecordId, sourceRecordId, themeRecordId]);

  const scopeLabel = getScopeLabel({
    routeKind,
    activeTheme,
    positionDetail,
    sourceDetail,
  });

  const evidenceSections = useMemo<EvidenceSection[]>(() => {
    if (activeAnswer) {
      const citedSet = new Set(activeAnswer.citedDataPointIds);
      const cited = activeAnswer.retrievedDataPoints.filter((dp) => citedSet.has(dp._id));
      const retrieved = activeAnswer.retrievedDataPoints.filter((dp) => !citedSet.has(dp._id));
      return [
        {
          key: "cited",
          title: "Cited in the answer",
          subtitle: "These are the cards the answer explicitly relied on.",
          items: cited,
          cited: true,
        },
        {
          key: "retrieved",
          title: "Retrieved for context",
          subtitle: "Nearby evidence retrieved but not explicitly cited.",
          items: retrieved,
        },
      ].filter((section) => section.items.length > 0);
    }

    if (positionDetail?.currentVersion) {
      return [
        {
          key: "support",
          title: "Supporting evidence",
          subtitle: "The evidence chain attached to this position version.",
          items: positionDetail.currentVersion.supportingEvidenceDetails ?? [],
        },
        {
          key: "counter",
          title: "Counter evidence",
          subtitle: "Signals that challenge or qualify the current stance.",
          items: positionDetail.currentVersion.counterEvidenceDetails ?? [],
          variant: "counter" as const,
        },
      ].filter((section) => section.items.length > 0);
    }

    if (sourceDetail) {
      return [
        {
          key: "source",
          title: "Linked data points",
          subtitle: "Every extracted claim currently attached to this source.",
          items: sourceDetail.dataPoints ?? [],
        },
      ];
    }

    return [];
  }, [activeAnswer, positionDetail, sourceDetail]);

  const userTurnsCount = turns.filter((turn) => turn.role === "user").length;
  const reachedTurnLimit = userTurnsCount >= USER_TURN_LIMIT;

  async function handleAskQuestion(questionText?: string) {
    const question = (questionText ?? input).trim();
    if (!projectId || !question || pending || reachedTurnLimit) return;

    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    const userTurn: Turn = { role: "user", content: question };
    const nextTurns = [...turns, userTurn];

    setTurns(nextTurns);
    setInput("");
    setPending(true);
    setError(null);
    setMobilePane("main");

    try {
      const result = (await askGrounded({
        question,
        projectId,
        conversationHistory: history,
        ...scopeArgs,
      })) as {
        answer: string;
        citations: ChatCitation[];
        citedDataPointIds: string[];
        retrievedDataPoints: DataPointForCard[];
      };

      const answerState: AssistantAnswer = {
        question,
        answer: result.answer,
        citations: result.citations ?? [],
        citedDataPointIds: result.citedDataPointIds ?? [],
        retrievedDataPoints: result.retrievedDataPoints ?? [],
        scopeLabel,
      };

      setTurns([
        ...nextTurns,
        {
          role: "assistant",
          content: result.answer,
          answerState,
        },
      ]);
      setActiveAnswer(answerState);
      setHighlightedEvidenceId(
        answerState.citedDataPointIds[0] ??
          answerState.retrievedDataPoints[0]?._id ??
          null,
      );
    } catch (err: any) {
      setTurns(nextTurns);
      setError(err?.message ?? "Something went wrong while querying the corpus.");
    } finally {
      setPending(false);
    }
  }

  function resetConversation() {
    setTurns([]);
    setActiveAnswer(null);
    setInput("");
    setError(null);
    setHighlightedEvidenceId(null);
  }

  return (
    <div className="px-[var(--spacing-page-x)] py-[var(--spacing-page-y)]">
      <WorkspaceTopbar
        projectName={projectName}
        routeKind={routeKind}
        scopeLabel={scopeLabel}
      />

      <div className="mb-3 flex items-center gap-2 xl:hidden">
        {(
          [
            { key: "main", label: "Main" },
            { key: "evidence", label: "Evidence" },
            { key: "chat", label: "Chat" },
          ] as Array<{ key: PaneMode; label: string }>
        ).map((pane) => (
          <button
            key={pane.key}
            type="button"
            onClick={() => setMobilePane(pane.key)}
            className={cn(
              "rounded-full border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink-soft",
              mobilePane === pane.key && "pane-tab-active",
            )}
          >
            {pane.label}
          </button>
        ))}
      </div>

      <div className="workspace-grid">
        <section
          className={cn(
            "pane-shell",
            mobilePane !== "main" && "hidden xl:flex",
          )}
        >
          <MainPane
            loading={loading}
            routeKind={routeKind}
            themes={themes ?? []}
            allPositions={allPositions ?? []}
            activeTheme={activeTheme}
            themePositions={themePositions ?? []}
            positionDetail={positionDetail}
            sourceDetail={sourceDetail}
            activeAnswer={activeAnswer}
            scopeLabel={scopeLabel}
            onClearAnswer={() => setActiveAnswer(null)}
            onCitationClick={(dataPointId) => {
              setHighlightedEvidenceId(dataPointId);
              setMobilePane("evidence");
            }}
          />
        </section>

        <section
          className={cn(
            "pane-shell",
            mobilePane !== "evidence" && "hidden xl:flex",
          )}
        >
          <EvidencePane
            activeAnswer={activeAnswer}
            sections={evidenceSections}
            highlightedEvidenceId={highlightedEvidenceId}
            onSelectEvidence={(dataPointId) => setHighlightedEvidenceId(dataPointId)}
          />
        </section>

        <section
          className={cn(
            "pane-shell",
            mobilePane !== "chat" && "hidden xl:flex",
          )}
        >
          <ChatPane
            routeKind={routeKind}
            scopeLabel={scopeLabel}
            turns={turns}
            pending={pending}
            input={input}
            error={error}
            setInput={setInput}
            onSubmit={handleAskQuestion}
            onReset={resetConversation}
            onUseSuggestion={(suggestion) => void handleAskQuestion(suggestion)}
            reachedTurnLimit={reachedTurnLimit}
            userTurnsCount={userTurnsCount}
          />
        </section>
      </div>
    </div>
  );
}

function WorkspaceTopbar({
  projectName,
  routeKind,
  scopeLabel,
}: {
  projectName: string | null;
  routeKind: RouteKind;
  scopeLabel: string;
}) {
  return (
    <header className="mb-4 rounded-[1.75rem] border border-border/75 bg-panel/95 px-5 py-4 shadow-[var(--shadow-panel)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_14px_28px_-18px_rgba(49,94,251,0.8)]">
            <LayersThree01 className="size-6" />
          </div>
          <div>
            <div className="meta-kicker">Curate Mind workspace</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Progressive disclosure for AI research</h1>
              {projectName && (
                <span className="rounded-full bg-panel-muted px-3 py-1 text-xs font-semibold text-ink-muted">
                  {projectName}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
              One workspace for browsing themes, reading positions, tracing evidence, and asking grounded questions without changing mental models.
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <TopbarLink to="/" active={routeKind === "home"}>
            <HomeLine className="size-4" />
            Workspace
          </TopbarLink>
          <TopbarLink to="/browse" active={routeKind === "theme"}>
            <Compass01 className="size-4" />
            Themes
          </TopbarLink>
          <TopbarLink to="/ask" active={routeKind === "ask"}>
            <MessageChatCircle className="size-4" />
            Ask
          </TopbarLink>
          <div className="hidden rounded-full border border-border bg-panel-muted px-3 py-2 text-xs font-semibold text-ink-muted xl:flex">
            {scopeLabel}
          </div>
        </nav>
      </div>
    </header>
  );
}

function TopbarLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3.5 py-2 text-sm font-semibold text-ink-soft hover:border-accent/20 hover:text-accent",
        active && "pane-tab-active",
      )}
    >
      {children}
    </Link>
  );
}

function MainPane({
  loading,
  routeKind,
  themes,
  allPositions,
  activeTheme,
  themePositions,
  positionDetail,
  sourceDetail,
  activeAnswer,
  scopeLabel,
  onClearAnswer,
  onCitationClick,
}: {
  loading: boolean;
  routeKind: RouteKind;
  themes: any[];
  allPositions: any[];
  activeTheme: any;
  themePositions: any[];
  positionDetail: any;
  sourceDetail: any;
  activeAnswer: AssistantAnswer | null;
  scopeLabel: string;
  onClearAnswer: () => void;
  onCitationClick: (dataPointId: string) => void;
}) {
  return (
    <>
      <PaneHeader
        icon={<BookOpen01 className="size-5" />}
        kicker={activeAnswer ? "Answer canvas" : "Main pane"}
        title={activeAnswer ? activeAnswer.question : getMainPaneTitle(routeKind, activeTheme, positionDetail, sourceDetail)}
        description={
          activeAnswer
            ? `Generated inside ${activeAnswer.scopeLabel.toLowerCase()}. Inline citations open the evidence stack in the next pane.`
            : getMainPaneDescription(routeKind, activeTheme, positionDetail, sourceDetail)
        }
        action={
          activeAnswer ? (
            <button
              type="button"
              onClick={onClearAnswer}
              className="rounded-full border border-border bg-panel px-3 py-2 text-xs font-semibold text-ink-soft hover:border-accent/20 hover:text-accent"
            >
              Return to context
            </button>
          ) : (
            <div className="rounded-full bg-panel-muted px-3 py-2 text-xs font-semibold text-ink-muted">
              {scopeLabel}
            </div>
          )
        }
      />

      <div className="pane-scroll px-5 pb-5 pt-4">
        {loading ? (
          <LoadingState />
        ) : activeAnswer ? (
          <AnswerDocument answerState={activeAnswer} onCitationClick={onCitationClick} />
        ) : positionDetail ? (
          <PositionDocument positionDetail={positionDetail} />
        ) : sourceDetail ? (
          <SourceDocument sourceDetail={sourceDetail} />
        ) : activeTheme ? (
          <ThemeDocument activeTheme={activeTheme} themePositions={themePositions} />
        ) : routeKind === "ask" ? (
          <AskDocument />
        ) : (
          <HomeDocument themes={themes} allPositions={allPositions} />
        )}
      </div>
    </>
  );
}

function PaneHeader({
  icon,
  kicker,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-divider px-5 pt-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-panel-muted text-accent">
            {icon}
          </div>
          <div>
            <div className="meta-kicker">{kicker}</div>
            <h2 className="display-balance mt-2 text-display-xs text-ink md:text-display-sm">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

function HomeDocument({
  themes,
  allPositions,
}: {
  themes: any[];
  allPositions: any[];
}) {
  const sortedThemes = [...themes].sort(
    (left, right) => (right.positionCount ?? 0) - (left.positionCount ?? 0),
  );
  const featuredPositions = [...allPositions].slice(0, 4);

  return (
    <div className="space-y-8">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-5">
        <div className="meta-kicker">Workspace brief</div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Metric label="Themes" value={themes.length} />
          <Metric label="Positions" value={allPositions.length} />
          <Metric label="Experience" value="3-pane" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="meta-kicker">Explore</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">Themes to open next</h3>
          </div>
          <Link to="/ask" className="text-sm font-semibold text-accent hover:text-accent-strong">
            Ask across the corpus
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedThemes.map((theme) => (
            <ThemeCard key={theme._id} theme={theme} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="meta-kicker">Fast paths</div>
          <h3 className="mt-2 text-xl font-semibold text-ink">Active positions</h3>
        </div>
        <div className="space-y-3">
          {featuredPositions.map((position) => (
            <PositionRow key={position._id} position={position} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AskDocument() {
  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-6">
        <div className="meta-kicker">Query the corpus</div>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Start from a question, not a page.</h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-soft">
          The chat pane stays grounded in curated data points. Once you ask, the answer takes over this pane and the supporting cards line up in evidence with the same behavior you see while browsing positions.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {[
          "Where does the research disagree on enterprise AI adoption?",
          "What patterns show up in successful agentic workflow rollouts?",
          "What counter-evidence weakens the strongest positions?",
          "Which themes are still evidence-thin?",
        ].map((prompt) => (
          <div key={prompt} className="rounded-[1.35rem] border border-border/75 bg-panel p-4">
            <div className="meta-kicker">Suggested prompt</div>
            <p className="mt-2 text-sm leading-7 text-ink-soft">{prompt}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function ThemeDocument({
  activeTheme,
  themePositions,
}: {
  activeTheme: any;
  themePositions: any[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/70 p-6">
        <div className="meta-kicker">Theme overview</div>
        <p className="mt-3 text-sm leading-7 text-ink-soft">
          {activeTheme.description ?? "Open a position to see its stance and evidence chain."}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="meta-kicker">Positions</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">Current theses inside this theme</h3>
          </div>
          <div className="rounded-full bg-panel-muted px-3 py-1 text-xs font-semibold text-ink-muted">
            {themePositions.length} positions
          </div>
        </div>

        <div className="space-y-3">
          {themePositions.map((position) => (
            <PositionRow key={position._id} position={position} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PositionDocument({ positionDetail }: { positionDetail: any }) {
  const version = positionDetail.currentVersion;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={version?.status ?? "active"} />
          {version?.confidenceLevel && (
            <StatusPill label={`Confidence ${version.confidenceLevel}`} tone="accent" />
          )}
          {typeof version?.versionNumber === "number" && (
            <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink-muted">
              Version {version.versionNumber}
            </span>
          )}
        </div>
        <div className="workspace-richtext mt-5">
          <p>{version?.currentStance ?? "No stance has been written for this position yet."}</p>
        </div>
      </section>

      {version?.openQuestions?.length > 0 && (
        <section className="rounded-[1.5rem] border border-border/75 bg-panel p-6">
          <div className="meta-kicker">Open questions</div>
          <ul className="workspace-richtext mt-4 space-y-3">
            {version.openQuestions.map((question: string) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {version?.observationDetails?.length > 0 && (
        <section className="rounded-[1.5rem] border border-border/75 bg-panel p-6">
          <div className="meta-kicker">Curator observations</div>
          <div className="mt-4 space-y-3">
            {version.observationDetails.map((observation: any) => (
              <div
                key={observation._id}
                className="rounded-[1.25rem] border border-border/75 bg-panel-muted/80 p-4 text-sm leading-7 text-ink-soft"
              >
                {observation.observationText}
              </div>
            ))}
          </div>
        </section>
      )}

      {version?.mentalModelDetails?.length > 0 && (
        <section className="rounded-[1.5rem] border border-border/75 bg-panel p-6">
          <div className="meta-kicker">Mental models</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {version.mentalModelDetails.map((model: any) => (
              <div key={model._id} className="rounded-[1.25rem] border border-border/75 bg-panel-muted/80 p-4">
                <div className="meta-kicker">{model.modelType}</div>
                <div className="mt-2 text-base font-semibold text-ink">{model.title}</div>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{model.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceDocument({ sourceDetail }: { sourceDetail: any }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-6">
        <div className="meta-kicker">Source record</div>
        <div className="mt-4">
          <SourceBadge source={sourceDetail.source} />
        </div>
        {sourceDetail.sourceSynthesis && (
          <p className="mt-4 text-sm leading-7 text-ink-soft">{sourceDetail.sourceSynthesis}</p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Linked data points" value={sourceDetail.dataPointCount} />
        <Metric label="Accessibility" value={sourceDetail.urlAccessibility} />
        <Metric label="Status" value={sourceDetail.status} />
      </section>
    </div>
  );
}

function AnswerDocument({
  answerState,
  onCitationClick,
}: {
  answerState: AssistantAnswer;
  onCitationClick: (dataPointId: string) => void;
}) {
  const citationMap = new Map(
    answerState.citations.map((citation) => [citation.label, citation.dataPointId]),
  );

  return (
    <article className="space-y-6">
      <section className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            {answerState.scopeLabel}
          </span>
          <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink-muted">
            {answerState.citedDataPointIds.length} citations
          </span>
        </div>
        <div className="mt-4">
          <div className="meta-kicker">Question</div>
          <p className="mt-2 text-lg font-semibold leading-8 text-ink">{answerState.question}</p>
        </div>
      </section>

      <section className="workspace-richtext rounded-[1.5rem] border border-border/75 bg-panel p-6">
        {renderAnswerBlocks(answerState.answer, citationMap, onCitationClick)}
      </section>
    </article>
  );
}

function EvidencePane({
  activeAnswer,
  sections,
  highlightedEvidenceId,
  onSelectEvidence,
}: {
  activeAnswer: AssistantAnswer | null;
  sections: EvidenceSection[];
  highlightedEvidenceId: string | null;
  onSelectEvidence: (dataPointId: string) => void;
}) {
  useEffect(() => {
    if (!highlightedEvidenceId) return;
    const element = document.getElementById(`evidence-card-${highlightedEvidenceId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedEvidenceId]);

  return (
    <>
      <PaneHeader
        icon={<File02 className="size-5" />}
        kicker="Evidence pane"
        title={activeAnswer ? "Citations and supporting cards" : "Evidence follows the current context"}
        description={
          activeAnswer
            ? "Every citation opens the exact evidence card here. The structure stays consistent whether you browse or ask."
            : "Open a position, source, or ask a question to populate this pane."
        }
      />

      <div className="pane-scroll px-5 pb-5 pt-4">
        {sections.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-panel-muted/60 p-5">
            <div className="meta-kicker">No evidence yet</div>
            <p className="mt-3 text-sm leading-7 text-ink-soft">
              The middle pane activates once you open a position, inspect a source, or generate an answer.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="meta-kicker">{section.title}</div>
                    <p className="mt-1 text-sm leading-6 text-ink-soft">{section.subtitle}</p>
                  </div>
                  <div className="rounded-full bg-panel-muted px-3 py-1 text-xs font-semibold text-ink-muted">
                    {section.items.length}
                  </div>
                </div>

                <div className="space-y-3">
                  {section.items.map((item, index) => (
                    <DataPointCard
                      key={item._id}
                      dp={item}
                      variant={section.variant}
                      isHighlighted={highlightedEvidenceId === item._id}
                      isCited={section.cited}
                      onSelect={() => onSelectEvidence(item._id)}
                      label={`${section.cited ? "DP" : section.variant === "counter" ? "CT" : "EV"} ${String(index + 1).padStart(2, "0")}`}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ChatPane({
  routeKind,
  scopeLabel,
  turns,
  pending,
  input,
  error,
  setInput,
  onSubmit,
  onReset,
  onUseSuggestion,
  reachedTurnLimit,
  userTurnsCount,
}: {
  routeKind: RouteKind;
  scopeLabel: string;
  turns: Turn[];
  pending: boolean;
  input: string;
  error: string | null;
  setInput: (value: string) => void;
  onSubmit: (questionText?: string) => Promise<void>;
  onReset: () => void;
  onUseSuggestion: (suggestion: string) => void;
  reachedTurnLimit: boolean;
  userTurnsCount: number;
}) {
  const suggestions = getSuggestions(routeKind);

  return (
    <>
      <PaneHeader
        icon={<MessageChatCircle className="size-5" />}
        kicker="Chat pane"
        title="Ask with context"
        description="The right pane stays available while you browse. Responses write into the main pane and citations synchronize with evidence."
        action={
          <div className="rounded-full bg-panel-muted px-3 py-2 text-xs font-semibold text-ink-muted">
            {scopeLabel}
          </div>
        }
      />

      <div className="pane-scroll px-5 pb-5 pt-4">
        <div className="rounded-[1.5rem] border border-border/75 bg-panel-muted/75 p-4">
          <div className="meta-kicker">Suggested prompts</div>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUseSuggestion(suggestion)}
                className="flex w-full items-start justify-between gap-3 rounded-[1.15rem] border border-border bg-panel px-4 py-3 text-left text-sm leading-6 text-ink-soft hover:border-accent/25 hover:text-ink"
              >
                <span>{suggestion}</span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-ink-muted" />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="meta-kicker">Conversation</div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-semibold text-ink-muted hover:text-accent"
              >
                Reset conversation
              </button>
            )}
          </div>

          {turns.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-border bg-panel-muted/60 p-4">
              <p className="text-sm leading-7 text-ink-soft">
                Start with a question. The answer will take over the main pane and line up its citations in evidence.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {turns.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={cn(
                    "rounded-[1.25rem] border px-4 py-3",
                    turn.role === "user"
                      ? "border-accent/18 bg-accent-soft/55"
                      : "border-border bg-panel",
                  )}
                >
                  <div className="meta-kicker">{turn.role === "user" ? "You" : "Assistant"}</div>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">
                    {turn.role === "assistant" ? summarizeText(turn.content, 240) : turn.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {pending && (
          <div className="mt-4 rounded-[1.25rem] border border-accent/18 bg-accent-soft/50 px-4 py-3 text-sm text-accent">
            Thinking through the evidence...
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-[1.25rem] border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-5 py-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="space-y-3"
        >
          <div className="rounded-[1.35rem] border border-border bg-panel-muted/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
              <SearchLg className="size-3.5" />
              Ask or search the corpus
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={4}
              disabled={pending || reachedTurnLimit}
              placeholder={
                reachedTurnLimit
                  ? "Conversation limit reached. Reset to ask another question."
                  : "Ask about the current theme, position, source, or the wider corpus..."
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="mt-3 w-full resize-none bg-transparent text-sm leading-7 text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-ink-muted">
              {userTurnsCount} / {USER_TURN_LIMIT} user turns
            </div>
            <button
              type="submit"
              disabled={pending || reachedTurnLimit || !input.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:bg-ink-muted"
            >
              Ask
              <ArrowRight className="size-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function ThemeCard({ theme }: { theme: any }) {
  return (
    <Link
      to={`/themes/${theme._id}`}
      className="group rounded-[1.4rem] border border-border/75 bg-panel p-5 hover:border-accent/20 hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center justify-between">
        <div className="meta-kicker">Theme</div>
        <div className="rounded-full bg-panel-muted px-3 py-1 text-xs font-semibold text-ink-muted">
          {theme.positionCount} positions
        </div>
      </div>
      <div className="mt-3 text-lg font-semibold text-ink">{theme.title}</div>
      {theme.description && (
        <p className="mt-2 text-sm leading-7 text-ink-soft">{theme.description}</p>
      )}
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">
        Open theme
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function PositionRow({ position }: { position: any }) {
  const stance = position.currentVersion?.currentStance ?? position.currentStance;

  return (
    <Link
      to={`/positions/${position._id}`}
      className="block rounded-[1.35rem] border border-border/75 bg-panel p-4 hover:border-accent/20 hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="meta-kicker">{position.themeTitle ?? "Position"}</div>
          <div className="mt-2 text-base font-semibold text-ink">{position.title}</div>
          {stance && <p className="mt-2 text-sm leading-7 text-ink-soft">{summarizeText(stance, 180)}</p>}
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-ink-muted" />
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.25rem] border border-border/75 bg-panel p-4">
      <div className="meta-kicker">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold",
        tone === "accent"
          ? "bg-accent-soft text-accent"
          : "bg-panel text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-[1.5rem] bg-panel-muted" />
      <div className="h-52 animate-pulse rounded-[1.5rem] bg-panel-muted" />
      <div className="h-40 animate-pulse rounded-[1.5rem] bg-panel-muted" />
    </div>
  );
}

function renderAnswerBlocks(
  text: string,
  citationMap: Map<string, string>,
  onCitationClick: (dataPointId: string) => void,
) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block, index) => {
      const trimmed = block.trim();
      const lines = trimmed.split("\n");

      if (lines.every((line) => line.startsWith("- "))) {
        return (
          <ul key={`${trimmed}-${index}`} className="space-y-3">
            {lines.map((line) => (
              <li key={line}>{renderInlineCitations(line.slice(2), citationMap, onCitationClick)}</li>
            ))}
          </ul>
        );
      }

      return (
        <p key={`${trimmed}-${index}`}>
          {renderInlineCitations(trimmed, citationMap, onCitationClick)}
        </p>
      );
    });
}

function renderInlineCitations(
  text: string,
  citationMap: Map<string, string>,
  onCitationClick: (dataPointId: string) => void,
) {
  return text.split(/(\[DP\d+\])/g).map((part, index) => {
    const label = part.replace(/[\[\]]/g, "");
    const dataPointId = citationMap.get(label);

    if (dataPointId) {
      return (
        <button
          key={`${label}-${index}`}
          type="button"
          className="citation-chip mx-1 align-middle"
          onClick={() => onCitationClick(dataPointId)}
        >
          {part}
        </button>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function getRouteKind(pathname: string): RouteKind {
  if (pathname === "/ask") return "ask";
  if (pathname.startsWith("/themes/")) return "theme";
  if (pathname.startsWith("/positions/")) return "position";
  if (pathname.startsWith("/sources/")) return "source";
  return "home";
}

function getScopeLabel({
  routeKind,
  activeTheme,
  positionDetail,
  sourceDetail,
}: {
  routeKind: RouteKind;
  activeTheme: any;
  positionDetail: any;
  sourceDetail: any;
}) {
  if (sourceDetail) return `Source · ${sourceDetail.source.title}`;
  if (positionDetail) return `Position · ${positionDetail.title}`;
  if (activeTheme) return `Theme · ${activeTheme.title}`;
  if (routeKind === "ask") return "Corpus-wide scope";
  return "Workspace overview";
}

function getMainPaneTitle(
  routeKind: RouteKind,
  activeTheme: any,
  positionDetail: any,
  sourceDetail: any,
) {
  if (positionDetail) return positionDetail.title;
  if (sourceDetail) return sourceDetail.source.title;
  if (activeTheme) return activeTheme.title;
  if (routeKind === "ask") return "Ask the research base";
  return "Browse the curated research system";
}

function getMainPaneDescription(
  routeKind: RouteKind,
  activeTheme: any,
  positionDetail: any,
  sourceDetail: any,
) {
  if (positionDetail) {
    return "Read the current stance here. The supporting and counter evidence stay aligned in the middle pane.";
  }

  if (sourceDetail) {
    return "Inspect the source record and its synthesis here while the extracted evidence cards stay visible beside it.";
  }

  if (activeTheme) {
    return "Themes gather multiple positions under one strategic thread. Open any position to switch from exploration into evidence review.";
  }

  if (routeKind === "ask") {
    return "Questions start in the chat pane. The answer is written here, with citations opening the evidence cards beside it.";
  }

  return "This workspace keeps exploration, evidence, and querying in one stable layout so the reader never has to reorient.";
}

function getSuggestions(routeKind: RouteKind) {
  if (routeKind === "source") {
    return [
      "What are the highest-signal claims in this source?",
      "Where is this source most cautious or uncertain?",
      "How does this source change the larger research position?",
    ];
  }

  if (routeKind === "position") {
    return [
      "What is the strongest supporting evidence for this position?",
      "What counter-evidence weakens this stance?",
      "What would change confidence in this position?",
    ];
  }

  if (routeKind === "theme") {
    return [
      "What are the main tensions inside this theme?",
      "Which positions here are most evidence-rich?",
      "What questions remain unresolved in this theme?",
    ];
  }

  return [
    "What patterns predict successful enterprise AI adoption?",
    "Where does the corpus disagree most strongly?",
    "What is emerging about agentic workflows?",
  ];
}

function summarizeText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}...`;
}
