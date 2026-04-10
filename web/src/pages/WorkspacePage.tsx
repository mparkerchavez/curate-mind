import {
  ArrowRight,
  BookOpen01,
  Compass01,
  File02,
  HomeLine,
  LayersThree01,
  MessageChatCircle,
  SearchLg,
} from "@untitledui/icons";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import DataPointCard, { type DataPointForCard } from "@/components/DataPointCard";
import SourceBadge from "@/components/SourceBadge";
import { useProject } from "@/ProjectContext";
import { api, Id } from "@/api";
import { cn } from "@/lib/cn";

type RouteKind = "home" | "theme" | "position" | "source" | "ask";
type PaneMode = "main" | "evidence";

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
  const contextKey = getContextKey({
    routeKind,
    themeId: themeRecordId,
    positionId: positionRecordId,
    sourceId: sourceRecordId,
  });

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
  const [isChatOpen, setIsChatOpen] = useState(routeKind === "ask");

  useEffect(() => {
    setTurns([]);
    setActiveAnswer(null);
    setHighlightedEvidenceId(null);
    setInput("");
    setError(null);
    setPending(false);
    setMobilePane("main");
  }, [contextKey]);

  useEffect(() => {
    if (routeKind === "ask") {
      setIsChatOpen(true);
    }
  }, [routeKind]);

  useEffect(() => {
    if (!isChatOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsChatOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChatOpen]);

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
          subtitle: "These cards were explicitly cited in the current answer.",
          items: cited,
          cited: true,
        },
        {
          key: "retrieved",
          title: "Retrieved for context",
          subtitle: "Adjacent evidence retrieved to ground the answer, even if it was not cited directly.",
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
          subtitle: "Signals that challenge, qualify, or narrow the current stance.",
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
          subtitle: "Claims currently extracted from this source record.",
          items: sourceDetail.dataPoints ?? [],
        },
      ].filter((section) => section.items.length > 0);
    }

    return [];
  }, [activeAnswer, positionDetail, sourceDetail]);

  const evidencePaneState = useMemo(
    () =>
      getEvidencePaneState({
        activeAnswer,
        activeTheme,
        positionDetail,
        sourceDetail,
        sections: evidenceSections,
      }),
    [activeAnswer, activeTheme, evidenceSections, positionDetail, sourceDetail],
  );

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
    setIsChatOpen(true);

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

  function handleCitationClick(dataPointId: string) {
    setHighlightedEvidenceId(dataPointId);
    setMobilePane("evidence");
    setIsChatOpen(false);
  }

  return (
    <div className="px-[var(--spacing-page-x)] py-[var(--spacing-page-y)]">
      <WorkspaceTopbar
        projectName={projectName}
        routeKind={routeKind}
        scopeLabel={scopeLabel}
        activeAnswer={activeAnswer}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen((open) => !open)}
      />

      <div className="mb-3 flex items-center gap-2 lg:hidden">
        {(
          [
            { key: "main", label: "Main" },
            { key: "evidence", label: "Evidence" },
          ] as Array<{ key: PaneMode; label: string }>
        ).map((pane) => (
          <button
            key={pane.key}
            type="button"
            onClick={() => setMobilePane(pane.key)}
            className={cn(
              "shell-nav-link rounded-full border px-4 py-2 text-sm font-semibold",
              mobilePane === pane.key && "pane-tab-active",
            )}
          >
            {pane.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_36px_-26px_rgba(49,94,251,0.85)]"
        >
          <MessageChatCircle className="size-4" />
          Ask
        </button>
      </div>

      <div className="workspace-grid">
        <section
          className={cn(
            "pane-shell editorial-panel min-h-[calc(100vh-13.75rem)]",
            mobilePane !== "main" && "hidden lg:flex",
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
            onCitationClick={handleCitationClick}
          />
        </section>

        <section
          className={cn(
            "pane-shell editorial-panel-muted min-h-[calc(100vh-13.75rem)]",
            mobilePane !== "evidence" && "hidden lg:flex",
          )}
        >
          <EvidencePane
            state={evidencePaneState}
            sections={evidenceSections}
            highlightedEvidenceId={highlightedEvidenceId}
            onSelectEvidence={(dataPointId) => setHighlightedEvidenceId(dataPointId)}
          />
        </section>
      </div>

      <ChatDockButton
        isOpen={isChatOpen}
        scopeLabel={scopeLabel}
        pending={pending}
        onClick={() => setIsChatOpen(true)}
      />

      <ChatOverlay
        isOpen={isChatOpen}
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
        onClose={() => setIsChatOpen(false)}
        reachedTurnLimit={reachedTurnLimit}
        userTurnsCount={userTurnsCount}
      />
    </div>
  );
}

function WorkspaceTopbar({
  projectName,
  routeKind,
  scopeLabel,
  activeAnswer,
  isChatOpen,
  onToggleChat,
}: {
  projectName: string | null;
  routeKind: RouteKind;
  scopeLabel: string;
  activeAnswer: AssistantAnswer | null;
  isChatOpen: boolean;
  onToggleChat: () => void;
}) {
  return (
    <header className="shell-topbar mb-4 rounded-[1.8rem] border px-5 py-4 shadow-[var(--shadow-panel)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_14px_28px_-18px_rgba(49,94,251,0.8)]">
            <LayersThree01 className="size-6" />
          </div>
          <div>
            <div className="meta-kicker">Curate Mind workspace</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="display-balance text-[2rem] leading-none text-ink sm:text-[2.2rem]">Calm research cockpit</h1>
              {projectName && (
                <span className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
                  {projectName}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-[0.98rem] leading-8 text-ink-soft">
              Read in the main canvas, keep evidence anchored beside it, and open chat above the context only when you need to query the corpus.
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
          <button
            type="button"
            onClick={onToggleChat}
            className={cn(
              "shell-nav-link inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold",
              isChatOpen
                ? "shell-nav-link-active"
                : "",
            )}
          >
            <MessageChatCircle className="size-4" />
            {isChatOpen ? "Hide chat" : "Open chat"}
          </button>
          <div className="count-chip hidden rounded-full px-3 py-2 text-xs font-semibold lg:flex">
            {scopeLabel}
          </div>
          {activeAnswer && (
            <div className="hidden rounded-full border border-accent/20 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent lg:flex">
              Answer in focus
            </div>
          )}
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
        "shell-nav-link inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold",
        active && "shell-nav-link-active",
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
        kicker={activeAnswer ? "Answer canvas" : "Reading canvas"}
        title={
          activeAnswer
            ? activeAnswer.question
            : getMainPaneTitle(routeKind, activeTheme, positionDetail, sourceDetail)
        }
        description={
          activeAnswer
            ? `Generated inside ${activeAnswer.scopeLabel.toLowerCase()}. Inline citations open the exact evidence cards beside this answer.`
            : getMainPaneDescription(routeKind, activeTheme, positionDetail, sourceDetail)
        }
        action={
          activeAnswer ? (
            <button
              type="button"
              onClick={onClearAnswer}
              className="shell-nav-link rounded-full border px-3 py-2 text-xs font-semibold"
            >
              Return to browsing
            </button>
          ) : (
            <div className="count-chip rounded-full px-3 py-2 text-xs font-semibold">
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
          <div className="flex size-11 items-center justify-center rounded-2xl border border-border/80 bg-panel text-accent">
            {icon}
          </div>
          <div>
            <div className="meta-kicker">{kicker}</div>
            <h2 className="display-balance mt-2 text-display-xs text-ink md:text-display-sm">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-[0.98rem] leading-8 text-ink-soft">{description}</p>
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
      <section className="editorial-panel rounded-[1.6rem] border p-5">
        <div className="meta-kicker">Workspace brief</div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Metric label="Themes" value={themes.length} />
          <Metric label="Positions" value={allPositions.length} />
          <Metric label="Experience" value="2 panes + chat" />
        </div>
      </section>

      <section className="editorial-panel rounded-[1.6rem] border p-6">
        <div className="meta-kicker">How to use the workspace</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <NarrativeCard
            title="Browse in one reading flow"
            body="The left canvas stays focused on the current theme, position, source, or answer so the reader always knows what is primary."
          />
          <NarrativeCard
            title="Keep evidence anchored"
            body="The right column is the lineage layer. Supporting and counter-cards stay visible whether you are reading or asking."
          />
          <NarrativeCard
            title="Open chat only when needed"
            body="The chat overlay sits above the workspace instead of consuming layout width, so questioning never overwhelms reading."
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="meta-kicker">Explore</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">Themes to open next</h3>
          </div>
          <span className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
            {sortedThemes.length} themes
          </span>
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
      <section className="editorial-panel rounded-[1.6rem] border p-6">
        <div className="meta-kicker">Query the corpus</div>
        <h3 className="display-balance mt-2 text-[2rem] leading-none text-ink">Open chat without losing the reading frame.</h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-soft">
          Questions begin in the overlay. Once you ask, the answer replaces this canvas and the evidence column reorganizes itself into cited cards first, retrieved context second.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {[
          "Where does the research disagree on enterprise AI adoption?",
          "What patterns show up in successful agentic workflow rollouts?",
          "What counter-evidence weakens the strongest positions?",
          "Which themes are still evidence-thin?",
        ].map((prompt) => (
          <div key={prompt} className="browser-card rounded-[1.35rem] border p-4">
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
      <section className="editorial-panel rounded-[1.5rem] border p-6">
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
          <div className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
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
      <section className="editorial-hero rounded-[1.65rem] border p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={version?.status ?? "active"} />
          {version?.confidenceLevel && (
            <StatusPill label={`Confidence ${version.confidenceLevel}`} tone="accent" />
          )}
          {typeof version?.versionNumber === "number" && (
            <span className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
              Version {version.versionNumber}
            </span>
          )}
        </div>
        <div className="workspace-richtext mt-5">
          <p>{version?.currentStance ?? "No stance has been written for this position yet."}</p>
        </div>
      </section>

      {version?.openQuestions?.length > 0 && (
        <section className="editorial-panel rounded-[1.5rem] border p-6">
          <div className="meta-kicker">Open questions</div>
          <ul className="workspace-richtext mt-4 space-y-3">
            {version.openQuestions.map((question: string) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {version?.observationDetails?.length > 0 && (
        <section className="editorial-panel rounded-[1.5rem] border p-6">
          <div className="meta-kicker">Curator observations</div>
          <div className="mt-4 space-y-3">
            {version.observationDetails.map((observation: any) => (
              <div
                key={observation._id}
                className="rounded-[1.25rem] border browser-card p-4 text-sm leading-7 text-ink-soft"
              >
                {observation.observationText}
              </div>
            ))}
          </div>
        </section>
      )}

      {version?.mentalModelDetails?.length > 0 && (
        <section className="editorial-panel rounded-[1.5rem] border p-6">
          <div className="meta-kicker">Mental models</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {version.mentalModelDetails.map((model: any) => (
              <div key={model._id} className="rounded-[1.25rem] border browser-card p-4">
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
      <section className="editorial-panel rounded-[1.5rem] border p-6">
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
      <section className="editorial-hero rounded-[1.6rem] border p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            {answerState.scopeLabel}
          </span>
          <span className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
            {answerState.citedDataPointIds.length} citations
          </span>
        </div>
        <div className="mt-4">
          <div className="meta-kicker">Question</div>
          <p className="mt-2 text-lg font-semibold leading-8 text-ink">{answerState.question}</p>
        </div>
      </section>

      <section className="workspace-richtext editorial-panel rounded-[1.5rem] border p-6">
        {renderAnswerDocument(answerState.answer, citationMap, onCitationClick)}
      </section>
    </article>
  );
}

function EvidencePane({
  state,
  sections,
  highlightedEvidenceId,
  onSelectEvidence,
}: {
  state: ReturnType<typeof getEvidencePaneState>;
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
        kicker="Evidence column"
        title={state.title}
        description={state.description}
      />

      <div className="pane-scroll px-5 pb-5 pt-4">
        {sections.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border/90 bg-panel/55 p-5">
            <div className="meta-kicker">{state.emptyTitle}</div>
            <p className="mt-3 text-sm leading-7 text-ink-soft">{state.emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <section
                key={section.key}
                className="rounded-[1.45rem] border border-border/75 bg-panel/55 p-4"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
                  <div>
                    <div className="meta-kicker">{section.title}</div>
                    <p className="mt-1 text-sm leading-6 text-ink-soft">{section.subtitle}</p>
                  </div>
                  <div className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
                    {section.items.length}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
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

function ChatDockButton({
  isOpen,
  scopeLabel,
  pending,
  onClick,
}: {
  isOpen: boolean;
  scopeLabel: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed bottom-5 right-5 z-30 hidden items-center gap-3 rounded-full border border-accent/20 bg-panel/95 px-4 py-3 text-left shadow-[0_22px_48px_-28px_rgba(47,36,22,0.45)] backdrop-blur lg:inline-flex",
        isOpen && "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-accent text-white">
        <MessageChatCircle className="size-4.5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-ink">
          {pending ? "Thinking through the evidence..." : "Ask with context"}
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">{scopeLabel}</div>
      </div>
    </button>
  );
}

function ChatOverlay({
  isOpen,
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
  onClose,
  reachedTurnLimit,
  userTurnsCount,
}: {
  isOpen: boolean;
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
  onClose: () => void;
  reachedTurnLimit: boolean;
  userTurnsCount: number;
}) {
  const suggestions = getSuggestions(routeKind);

  return (
    <>
      <div
        aria-hidden={!isOpen}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/18 backdrop-blur-[2px] transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ask with context"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-l border-border/70 bg-panel/96 shadow-[-30px_0_60px_-42px_rgba(47,36,22,0.45)] backdrop-blur-lg transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="border-b border-border/70 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="meta-kicker">Chat overlay</div>
              <h2 className="mt-2 text-xl font-semibold text-ink">Ask with live context</h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                The answer writes into the main canvas while this overlay keeps the prompt flow, history, and scope controls in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shell-nav-link rounded-full border px-3 py-2 text-xs font-semibold"
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              {scopeLabel}
            </span>
            <span className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
              {userTurnsCount} / {USER_TURN_LIMIT} turns
            </span>
          </div>
        </div>

        <div className="pane-scroll px-5 pb-5 pt-4">
          <div className="editorial-panel rounded-[1.5rem] border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="meta-kicker">Suggested prompts</div>
                <p className="mt-1 text-sm leading-6 text-ink-soft">
                  Start narrow, then use the evidence column to verify what the answer relied on.
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onUseSuggestion(suggestion)}
                  className="browser-card flex w-full items-start justify-between gap-3 rounded-[1.15rem] border px-4 py-3 text-left text-sm leading-6 text-ink-soft"
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
                  Ask a question from the current context. The answer will replace the main canvas and line up its cited cards in the evidence column.
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
                        : "border-border browser-card",
                    )}
                  >
                    <div className="meta-kicker">{turn.role === "user" ? "You" : "Assistant"}</div>
                    <p className="mt-2 text-sm leading-7 text-ink-soft">
                      {turn.role === "assistant" ? summarizeText(turn.content, 260) : turn.content}
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
            <div className="rounded-[1.45rem] border border-border bg-panel-muted/60 px-4 py-3">
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
                Cmd/Ctrl + Enter to submit
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
      </aside>
    </>
  );
}

function ThemeCard({ theme }: { theme: any }) {
  return (
    <Link
      to={`/themes/${theme._id}`}
      className="group browser-card block rounded-[1.4rem] border p-5 transition-all hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center justify-between">
        <div className="meta-kicker">Theme</div>
        <div className="count-chip rounded-full px-3 py-1 text-xs font-semibold">
          {theme.positionCount} positions
        </div>
      </div>
      <div className="mt-3 text-[1.45rem] leading-10 text-ink">{theme.title}</div>
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
      className="browser-card block rounded-[1.35rem] border p-4 transition-all hover:shadow-[var(--shadow-float)]"
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

function NarrativeCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="browser-card rounded-[1.3rem] border p-4">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-2 text-sm leading-7 text-ink-soft">{body}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="browser-card rounded-[1.25rem] border p-4">
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
        "rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "accent"
          ? "border-accent/18 bg-accent-soft text-accent"
          : "border-border/85 bg-panel text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-[1.5rem] bg-panel-muted/85" />
      <div className="h-52 animate-pulse rounded-[1.5rem] bg-panel-muted/85" />
      <div className="h-40 animate-pulse rounded-[1.5rem] bg-panel-muted/85" />
    </div>
  );
}

function renderAnswerDocument(
  text: string,
  citationMap: Map<string, string>,
  onCitationClick: (dataPointId: string) => void,
) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index].trim();

    if (!current) {
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(current)) {
      blocks.push(<hr key={`rule-${index}`} className="workspace-rule" />);
      index += 1;
      continue;
    }

    const headingMatch = current.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineRichText(
        headingMatch[2],
        citationMap,
        onCitationClick,
      );

      if (level === 1) {
        blocks.push(
          <h1 key={`heading-${index}`} className="text-display-xs md:text-display-sm">
            {content}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`heading-${index}`} className="text-2xl">
            {content}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={`heading-${index}`} className="text-xl">
            {content}
          </h3>,
        );
      }

      index += 1;
      continue;
    }

    if (current.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInlineRichText(quoteLines.join(" "), citationMap, onCitationClick)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(current)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`} className="space-y-3">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              {renderInlineRichText(item, citationMap, onCitationClick)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(current)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="workspace-ordered-list space-y-3">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              {renderInlineRichText(item, citationMap, onCitationClick)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        /^(-{3,}|\*{3,})$/.test(candidate) ||
        /^(#{1,3})\s+/.test(candidate) ||
        /^>\s?/.test(candidate) ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${index}`}>
        {renderInlineRichText(paragraphLines.join(" "), citationMap, onCitationClick)}
      </p>,
    );
  }

  return blocks;
}

function renderInlineRichText(
  text: string,
  citationMap: Map<string, string>,
  onCitationClick: (dataPointId: string) => void,
) {
  return text.split(/(\[DP\d+\]|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (!part) return null;

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

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="rounded bg-panel-muted px-1.5 py-0.5 text-[0.95em] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function getEvidencePaneState({
  activeAnswer,
  activeTheme,
  positionDetail,
  sourceDetail,
  sections,
}: {
  activeAnswer: AssistantAnswer | null;
  activeTheme: any;
  positionDetail: any;
  sourceDetail: any;
  sections: EvidenceSection[];
}) {
  if (activeAnswer) {
    return {
      title: "Citations and supporting cards",
      description:
        "Every citation in the answer maps back to a card here. Cited evidence comes first, then the nearby context retrieved for grounding.",
      emptyTitle: "Waiting on grounded evidence",
      emptyDescription:
        "Once the answer is generated, its cited and retrieved evidence cards will appear here.",
    };
  }

  if (positionDetail) {
    return {
      title: "Evidence linked to this position",
      description:
        "Supporting and counter-evidence stay anchored here while you read the current stance in the main canvas.",
      emptyTitle: "No linked evidence yet",
      emptyDescription:
        "This position does not have evidence cards attached yet.",
    };
  }

  if (sourceDetail) {
    return {
      title: "Claims extracted from this source",
      description:
        "The evidence column shows every data point currently linked to this source so you can inspect its lineage without leaving the reading flow.",
      emptyTitle: "No extracted claims yet",
      emptyDescription:
        "This source has not produced linked data points yet.",
    };
  }

  if (activeTheme) {
    return {
      title: "Evidence will follow the position you open",
      description:
        "Themes organize positions, but the evidence column becomes active once you open a position or ask a question grounded in the theme.",
      emptyTitle: "Choose a position to inspect",
      emptyDescription:
        "Open one of this theme’s positions to bring supporting evidence into view.",
    };
  }

  if (sections.length > 0) {
    return {
      title: "Evidence in current context",
      description:
        "This column stays reserved for claims, quotes, and source lineage tied to what you are reading.",
      emptyTitle: "No evidence yet",
      emptyDescription:
        "Open a position, source, or grounded answer to populate the evidence column.",
    };
  }

  return {
    title: "Evidence column",
    description:
      "The right column is the lineage layer. Open a position, inspect a source, or ask a grounded question to populate it.",
    emptyTitle: "No evidence in view",
    emptyDescription:
      "The evidence column will populate as soon as you open a position, source, or grounded answer.",
  };
}

function getContextKey({
  routeKind,
  themeId,
  positionId,
  sourceId,
}: {
  routeKind: RouteKind;
  themeId?: Id<"researchThemes">;
  positionId?: Id<"researchPositions">;
  sourceId?: Id<"sources">;
}) {
  if (sourceId) return `source:${sourceId}`;
  if (positionId) return `position:${positionId}`;
  if (themeId) return `theme:${themeId}`;
  if (routeKind === "ask") return "ask";
  return "home";
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
    return "Read the current stance here while the evidence column keeps the supporting and counter-signals in view.";
  }

  if (sourceDetail) {
    return "Inspect the source record and synthesis here while the extracted evidence cards stay visible beside it.";
  }

  if (activeTheme) {
    return "Themes gather multiple positions under one strategic thread. Open any position to move from exploration into evidence review.";
  }

  if (routeKind === "ask") {
    return "Questions start in the chat overlay. The answer is written here, with citations opening the evidence cards beside it.";
  }

  return "This workspace keeps reading and evidence stable, then layers chat on top only when the user wants to query the corpus.";
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
