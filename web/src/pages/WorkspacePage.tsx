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
import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { TextAreaBase } from "@/components/base/textarea/textarea";
import { ConfidenceBadge, StatusBadge } from "@/components/Badges";
import DataPointCard, { type DataPointForCard } from "@/components/DataPointCard";
import SourceBadge from "@/components/SourceBadge";
import { useProject } from "@/ProjectContext";
import { api, Id } from "@/api";
import { cn } from "@/lib/cn";

type RouteKind = "home" | "browse" | "theme" | "position" | "source" | "ask";
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
  const navigate = useNavigate();
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
  const [browseSelectedThemeId, setBrowseSelectedThemeId] = useState<Id<"researchThemes"> | null>(null);

  const askGrounded = useAction(api.chat.askGrounded);
  const themes = useQuery(api.positions.getThemes, projectId ? { projectId } : "skip");
  const allPositions = useQuery(api.positions.listAllPositions, projectId ? {} : "skip");
  const sortedThemes = useMemo(
    () =>
      [...(themes ?? [])].sort((left: any, right: any) => {
        const countDiff = (right.positionCount ?? 0) - (left.positionCount ?? 0);
        if (countDiff !== 0) return countDiff;
        return String(left.title ?? "").localeCompare(String(right.title ?? ""));
      }),
    [themes],
  );

  const browseThemeRecordId =
    routeKind === "browse" ? (browseSelectedThemeId ?? undefined) : undefined;
  const selectedThemeRecordId = themeRecordId ?? browseThemeRecordId;

  const themePositions = useQuery(
    api.positions.getPositionsByTheme,
    selectedThemeRecordId ? { themeId: selectedThemeRecordId } : "skip",
  );
  const positionDetail = useQuery(
    api.positions.getPositionDetail,
    positionRecordId ? { positionId: positionRecordId } : "skip",
  );
  const sourceDetail = useQuery(
    api.sources.getSourceDetail,
    sourceRecordId ? { sourceId: sourceRecordId } : "skip",
  );

  useEffect(() => {
    if (routeKind !== "browse") return;
    if (!sortedThemes.length) return;

    const hasSelectedTheme = browseSelectedThemeId
      ? sortedThemes.some((theme: any) => String(theme._id) === String(browseSelectedThemeId))
      : false;

    if (!hasSelectedTheme) {
      setBrowseSelectedThemeId(sortedThemes[0]._id);
    }
  }, [browseSelectedThemeId, routeKind, sortedThemes]);

  const activeTheme =
    routeKind === "browse"
      ? sortedThemes.find((theme: any) => String(theme._id) === String(browseSelectedThemeId)) ?? null
      : themes?.find((theme: any) => String(theme._id) === themeId) ?? positionDetail?.theme ?? null;

  const contextKey = getContextKey({
    routeKind,
    themeId: selectedThemeRecordId,
    positionId: positionRecordId,
    sourceId: sourceRecordId,
  });

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

  const scopeArgs = useMemo(() => {
    if (sourceRecordId) return { sourceId: sourceRecordId };
    if (positionRecordId) return { positionId: positionRecordId };
    if (selectedThemeRecordId) return { themeId: selectedThemeRecordId };
    return {};
  }, [positionRecordId, selectedThemeRecordId, sourceRecordId]);

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
          subtitle: "These records were directly cited in the current response.",
          items: cited,
          cited: true,
        },
        {
          key: "retrieved",
          title: "Retrieved for context",
          subtitle: "Adjacent evidence used to ground the answer.",
          items: retrieved,
        },
      ].filter((section) => section.items.length > 0);
    }

    if (positionDetail?.currentVersion) {
      return [
        {
          key: "support",
          title: "Supporting evidence",
          subtitle: "Evidence attached to this position version.",
          items: positionDetail.currentVersion.supportingEvidenceDetails ?? [],
        },
        {
          key: "counter",
          title: "Counter evidence",
          subtitle: "Signals that narrow, qualify, or challenge the current stance.",
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
          subtitle: "Claims currently extracted from this source.",
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
      }),
    [activeAnswer, activeTheme, positionDetail, sourceDetail],
  );

  const userTurnsCount = turns.filter((turn) => turn.role === "user").length;
  const reachedTurnLimit = userTurnsCount >= USER_TURN_LIMIT;

  const isMainLoading =
    loading ||
    themes === undefined ||
    allPositions === undefined ||
    (routeKind === "browse" && sortedThemes.length > 0 && !browseSelectedThemeId) ||
    (selectedThemeRecordId ? themePositions === undefined : false) ||
    (positionRecordId ? positionDetail === undefined : false) ||
    (sourceRecordId ? sourceDetail === undefined : false);

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
        answerState.citedDataPointIds[0] ?? answerState.retrievedDataPoints[0]?._id ?? null,
      );
      setIsChatOpen(false);
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
  }

  const navItems = [
    { key: "home", label: "Workspace", path: "/", icon: HomeLine },
    { key: "browse", label: "Browse", path: "/browse", icon: Compass01 },
    { key: "ask", label: "Ask", path: "/ask", icon: MessageChatCircle },
  ] as const;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 lg:px-6">
        <WorkspaceHeader
          projectName={projectName}
          routeKind={routeKind}
          scopeLabel={scopeLabel}
          activeAnswer={activeAnswer}
          navItems={navItems}
          onNavigate={(path) => navigate(path)}
          onOpenChat={() => setIsChatOpen(true)}
        />

        <div className="lg:hidden">
          <Tabs selectedKey={mobilePane} onSelectionChange={(key) => setMobilePane(String(key) as PaneMode)}>
            <TabList
              size="sm"
              type="button-border"
              items={[
                { id: "main", children: "Canvas" },
                { id: "evidence", children: "Evidence" },
              ]}
            />
          </Tabs>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]">
          <ShellPanel className={cn(mobilePane !== "main" && "hidden lg:block")}>
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
                  ? `Generated in ${activeAnswer.scopeLabel.toLowerCase()}. Citations in the answer jump to the exact evidence cards beside it.`
                  : getMainPaneDescription(routeKind, activeTheme, positionDetail, sourceDetail)
              }
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {activeAnswer ? (
                    <Button size="sm" color="secondary" onClick={() => setActiveAnswer(null)}>
                      Return to browsing
                    </Button>
                  ) : null}
                  <Button size="sm" color="primary" iconLeading={MessageChatCircle} onClick={() => setIsChatOpen(true)}>
                    Ask
                  </Button>
                </div>
              }
            />

            <div className="px-4 pb-4 pt-2 lg:px-5">
              {isMainLoading ? (
                <LoadingState />
              ) : activeAnswer ? (
                <AnswerDocument answerState={activeAnswer} onCitationClick={handleCitationClick} />
              ) : routeKind === "browse" ? (
                <BrowseDocument
                  themes={sortedThemes}
                  selectedTheme={activeTheme}
                  selectedThemeId={browseSelectedThemeId}
                  themePositions={themePositions ?? []}
                  allPositions={allPositions ?? []}
                  onSelectTheme={setBrowseSelectedThemeId}
                  onOpenTheme={(id) => navigate(`/themes/${id}`)}
                  onOpenPosition={(id) => navigate(`/positions/${id}`)}
                />
              ) : positionDetail ? (
                <PositionDocument
                  positionDetail={positionDetail}
                  onOpenPosition={(id) => navigate(`/positions/${id}`)}
                />
              ) : sourceDetail ? (
                <SourceDocument sourceDetail={sourceDetail} />
              ) : activeTheme ? (
                <ThemeDocument
                  activeTheme={activeTheme}
                  themePositions={themePositions ?? []}
                  onOpenPosition={(id) => navigate(`/positions/${id}`)}
                />
              ) : routeKind === "ask" ? (
                <AskDocument onOpenChat={() => setIsChatOpen(true)} />
              ) : (
                <HomeDocument
                  themes={sortedThemes}
                  allPositions={allPositions ?? []}
                  onOpenTheme={(id) => navigate(`/themes/${id}`)}
                  onBrowse={() => navigate("/browse")}
                  onOpenPosition={(id) => navigate(`/positions/${id}`)}
                />
              )}
            </div>
          </ShellPanel>

          <ShellPanel className={cn(mobilePane !== "evidence" && "hidden lg:block")}>
            <PaneHeader
              icon={<File02 className="size-5" />}
              kicker="Evidence column"
              title={evidencePaneState.title}
              description={evidencePaneState.description}
              action={
                sectionsCountBadge(evidenceSections)
              }
            />

            <EvidencePane
              state={evidencePaneState}
              sections={evidenceSections}
              highlightedEvidenceId={highlightedEvidenceId}
              onSelectEvidence={(dataPointId) => setHighlightedEvidenceId(dataPointId)}
            />
          </ShellPanel>
        </div>
      </div>

      <ChatModal
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

function WorkspaceHeader({
  projectName,
  routeKind,
  scopeLabel,
  activeAnswer,
  navItems,
  onNavigate,
  onOpenChat,
}: {
  projectName: string | null;
  routeKind: RouteKind;
  scopeLabel: string;
  activeAnswer: AssistantAnswer | null;
  navItems: ReadonlyArray<{
    key: string;
    label: string;
    path: string;
    icon: FC<{ className?: string }>;
  }>;
  onNavigate: (path: string) => void;
  onOpenChat: () => void;
}) {
  return (
    <header className="sticky top-4 z-20 rounded-[28px] border border-white/60 bg-white/90 px-4 py-4 shadow-[var(--ui-shell-shadow)] backdrop-blur lg:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-solid text-white shadow-xs-skeuomorphic">
            <LayersThree01 className="size-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge type="color" size="sm" color="brand">
                Curate Mind
              </Badge>
              {projectName ? (
                <Badge type="color" size="sm" color="gray">
                  {projectName}
                </Badge>
              ) : null}
              {activeAnswer ? (
                <Badge type="color" size="sm" color="brand">
                  Answer in focus
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-display-xs font-semibold tracking-[-0.02em] text-slate-950">
              Research workspace
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Untitled UI now drives the shell, controls, and content surfaces across the entire app while keeping the reading, evidence, and grounded chat workflow intact.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const isActive =
                (item.key === "home" && routeKind === "home") ||
                (item.key === "browse" && (routeKind === "browse" || routeKind === "theme")) ||
                (item.key === "ask" && routeKind === "ask");

              return (
                <Button
                  key={item.key}
                  size="sm"
                  color={isActive ? "primary" : "secondary"}
                  iconLeading={item.icon}
                  onClick={() => onNavigate(item.path)}
                >
                  {item.label}
                </Button>
              );
            })}

            <Button size="sm" color="secondary" iconLeading={MessageChatCircle} onClick={onOpenChat}>
              Open chat
            </Button>
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <BadgeWithDot type="pill-color" size="sm" color="gray">
              {scopeLabel}
            </BadgeWithDot>
          </div>
        </div>
      </div>
    </header>
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
    <div className="border-b border-slate-200 px-4 py-4 lg:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-fg-brand-primary">
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{kicker}</p>
            <h2 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.02em] text-slate-950">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
          </div>
        </div>

        {action}
      </div>
    </div>
  );
}

function ShellPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-h-[calc(100vh-10rem)] overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[var(--ui-shell-shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function HomeDocument({
  themes,
  allPositions,
  onOpenTheme,
  onBrowse,
  onOpenPosition,
}: {
  themes: any[];
  allPositions: any[];
  onOpenTheme: (id: string) => void;
  onBrowse: () => void;
  onOpenPosition: (id: string) => void;
}) {
  const featuredPositions = [...allPositions].slice(0, 4);

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Workspace brief
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
              Start with the highest-signal research threads.
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
              Browse themes, open a position when you want stance and lineage, or launch grounded chat when you want synthesis without leaving the source context.
            </p>
          </div>

          <Button size="sm" color="primary" iconTrailing={ArrowRight} onClick={onBrowse}>
            Browse themes
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MetricCard label="Themes" value={themes.length} />
          <MetricCard label="Positions" value={allPositions.length} />
          <MetricCard label="Mode" value="Reading + evidence + chat" />
        </div>
      </section>

      <ContentSection
        kicker="Themes"
        title="Research threads in play"
        meta={`${themes.length} total`}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {themes.map((theme) => (
            <ActionCard
              key={theme._id}
              eyebrow={`Theme · ${theme.positionCount ?? 0} positions`}
              title={theme.title}
              description={theme.description ?? "Open this theme to review the current position set and its research posture."}
              onClick={() => onOpenTheme(theme._id)}
              cta="Open theme"
            />
          ))}
        </div>
      </ContentSection>

      <ContentSection kicker="Fast paths" title="Recently active positions">
        <div className="space-y-3">
          {featuredPositions.map((position) => (
            <PositionRow
              key={position._id}
              position={position}
              onOpen={() => onOpenPosition(position._id)}
            />
          ))}
        </div>
      </ContentSection>
    </div>
  );
}

function BrowseDocument({
  themes,
  selectedTheme,
  selectedThemeId,
  themePositions,
  allPositions,
  onSelectTheme,
  onOpenTheme,
  onOpenPosition,
}: {
  themes: any[];
  selectedTheme: any;
  selectedThemeId: Id<"researchThemes"> | null;
  themePositions: any[];
  allPositions: any[];
  onSelectTheme: (themeId: Id<"researchThemes">) => void;
  onOpenTheme: (id: string) => void;
  onOpenPosition: (id: string) => void;
}) {
  const posture = getThemePosture(themePositions);
  const featuredPositions = [...themePositions]
    .sort((left, right) => comparePositionsByFreshness(left, right))
    .slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Theme selector
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            Scan the corpus by thread
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {themes.length} themes · {allPositions.length} positions
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {themes.map((theme) => {
            const isActive = String(theme._id) === String(selectedThemeId);
            return (
              <button
                key={theme._id}
                type="button"
                onClick={() => onSelectTheme(theme._id)}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  isActive
                    ? "border-utility-brand-200 bg-utility-brand-50 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                    : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{theme.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {theme.positionCount ?? 0} positions
                    </p>
                  </div>
                  <ArrowRight className={cn("mt-1 size-4 text-slate-400", isActive && "text-utility-brand-700")} />
                </div>
                {theme.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {summarizeText(theme.description, 120)}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      {selectedTheme ? (
        <div className="space-y-4">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Theme detail
                </p>
                <h3 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em] text-slate-950">
                  {selectedTheme.title}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                  {selectedTheme.description ?? "This theme groups the positions that currently share the same strategic thread."}
                </p>
              </div>

              <Button size="sm" color="secondary" iconTrailing={ArrowRight} onClick={() => onOpenTheme(selectedTheme._id)}>
                Open full theme
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <BadgeWithDot type="pill-color" size="sm" color="gray">
                {themePositions.length} positions
              </BadgeWithDot>
              <BadgeWithDot type="pill-color" size="sm" color="brand">
                {posture.confidenceSummary}
              </BadgeWithDot>
              <BadgeWithDot type="pill-color" size="sm" color="gray">
                {posture.latestFreshness}
              </BadgeWithDot>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Current positions"
              meta={`${themePositions.length} total`}
            >
              <div className="space-y-3">
                {themePositions.length > 0 ? (
                  themePositions
                    .slice()
                    .sort((left, right) => comparePositionsByFreshness(left, right))
                    .map((position) => (
                      <PositionRow
                        key={position._id}
                        position={position}
                        onOpen={() => onOpenPosition(position._id)}
                        compact
                      />
                    ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm leading-6 text-slate-600">
                    No positions are attached to this theme yet.
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Research posture">
              <div className="grid gap-3">
                {posture.cards.map((card) => (
                  <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-950">{card.value}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Open next" meta={`${featuredPositions.length} suggested`}>
            <div className="space-y-3">
              {featuredPositions.length > 0 ? (
                featuredPositions.map((position) => (
                  <PositionRow
                    key={position._id}
                    position={position}
                    onOpen={() => onOpenPosition(position._id)}
                    compact
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm leading-6 text-slate-600">
                  Add version dates to positions in this theme to unlock freshness-based suggestions.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      ) : (
        <EmptyPaneState
          title="Choose a theme"
          description="Select a theme from the left rail to load its position set, posture snapshot, and next-open recommendations."
        />
      )}
    </div>
  );
}

function ThemeDocument({
  activeTheme,
  themePositions,
  onOpenPosition,
}: {
  activeTheme: any;
  themePositions: any[];
  onOpenPosition: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Theme overview
        </p>
        <h3 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.02em] text-slate-950">
          {activeTheme.title}
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {activeTheme.description ?? "Open a position to see the current stance and evidence chain."}
        </p>
      </section>

      <ContentSection
        kicker="Positions"
        title="Current theses inside this theme"
        meta={`${themePositions.length} positions`}
      >
        <div className="space-y-3">
          {themePositions.map((position) => (
            <PositionRow
              key={position._id}
              position={position}
              onOpen={() => onOpenPosition(position._id)}
            />
          ))}
        </div>
      </ContentSection>
    </div>
  );
}

function PositionDocument({
  positionDetail,
}: {
  positionDetail: any;
  onOpenPosition: (id: string) => void;
}) {
  const version = positionDetail.currentVersion;

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-utility-brand-200 bg-utility-brand-50/50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {version?.status ? <StatusBadge status={version.status} /> : null}
          {version?.confidenceLevel ? <ConfidenceBadge confidence={version.confidenceLevel} /> : null}
          {typeof version?.versionNumber === "number" ? (
            <Badge type="color" size="sm" color="gray">
              Version {version.versionNumber}
            </Badge>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          <h3 className="text-[1.75rem] font-semibold tracking-[-0.02em] text-slate-950">
            {positionDetail.title}
          </h3>
          <p className="text-base leading-8 text-slate-700">
            {version?.currentStance ?? "No stance has been written for this position yet."}
          </p>
        </div>
      </section>

      {version?.openQuestions?.length > 0 ? (
        <SectionCard title="Open questions">
          <ul className="space-y-3">
            {version.openQuestions.map((question: string) => (
              <li key={question} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
                {question}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {version?.observationDetails?.length > 0 ? (
        <SectionCard title="Curator observations">
          <div className="space-y-3">
            {version.observationDetails.map((observation: any) => (
              <div
                key={observation._id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-700"
              >
                {observation.observationText}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {version?.mentalModelDetails?.length > 0 ? (
        <SectionCard title="Mental models">
          <div className="grid gap-3 md:grid-cols-2">
            {version.mentalModelDetails.map((model: any) => (
              <div key={model._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <Badge type="color" size="sm" color="gray">
                  {model.modelType}
                </Badge>
                <p className="mt-3 text-base font-semibold text-slate-950">{model.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{model.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function SourceDocument({ sourceDetail }: { sourceDetail: any }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Source record
        </p>
        <div className="mt-4">
          <SourceBadge source={sourceDetail.source} />
        </div>
        {sourceDetail.sourceSynthesis ? (
          <p className="mt-4 text-sm leading-7 text-slate-600">{sourceDetail.sourceSynthesis}</p>
        ) : null}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Linked data points" value={sourceDetail.dataPointCount} />
        <MetricCard label="Accessibility" value={sourceDetail.urlAccessibility} />
        <MetricCard label="Status" value={sourceDetail.status} />
      </div>
    </div>
  );
}

function AskDocument({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Query the corpus
        </p>
        <h3 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em] text-slate-950">
          Ask grounded questions without losing the reading frame.
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          The chat drawer uses the current theme, position, source, or the full corpus as scope. Answers write back into the main canvas and reconfigure the evidence column around citations first.
        </p>
        <div className="mt-4">
          <Button size="sm" color="primary" iconLeading={MessageChatCircle} onClick={onOpenChat}>
            Open grounded chat
          </Button>
        </div>
      </section>

      <SectionCard title="Suggested prompts">
        <div className="grid gap-3 md:grid-cols-2">
          {getSuggestions("ask").map((prompt) => (
            <PromptCard key={prompt} prompt={prompt} onClick={() => onOpenChat()} />
          ))}
        </div>
      </SectionCard>
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
      <section className="rounded-[24px] border border-utility-brand-200 bg-utility-brand-50/50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge type="color" size="sm" color="brand">
            {answerState.scopeLabel}
          </Badge>
          <Badge type="color" size="sm" color="gray">
            {answerState.citedDataPointIds.length} citations
          </Badge>
        </div>
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Question</p>
          <p className="mt-2 text-xl font-semibold leading-8 text-slate-950">{answerState.question}</p>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-6">
        <div className="space-y-4 text-[1rem] leading-8 text-slate-700">
          {renderAnswerDocument(answerState.answer, citationMap, onCitationClick)}
        </div>
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
    <div className="px-4 pb-4 pt-2 lg:px-5">
      {sections.length === 0 ? (
        <EmptyPaneState title={state.emptyTitle} description={state.emptyDescription} />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <section key={section.key} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{section.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{section.subtitle}</p>
                </div>
                <Badge type="color" size="sm" color="gray">
                  {section.items.length}
                </Badge>
              </div>

              <ol className="mt-4 space-y-3">
                {section.items.map((item, index) => (
                  <li key={item._id}>
                    <DataPointCard
                      dp={item}
                      variant={section.variant}
                      isHighlighted={highlightedEvidenceId === item._id}
                      isCited={section.cited}
                      onSelect={() => onSelectEvidence(item._id)}
                      label={`${section.cited ? "DP" : section.variant === "counter" ? "CT" : "EV"} ${String(index + 1).padStart(2, "0")}`}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatModal({
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

  if (!isOpen) return null;

  return (
    <ModalOverlay isOpen={isOpen} isDismissable onOpenChange={(open) => !open && onClose()}>
      <Modal className="w-full max-w-5xl">
        <Dialog className="w-full">
          <div className="w-full overflow-hidden rounded-[32px] border border-white/40 bg-white shadow-[var(--ui-shell-shadow)]">
            <div className="flex flex-col gap-0 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="border-b border-slate-200 xl:border-b-0 xl:border-r">
                <div className="border-b border-slate-200 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        Grounded chat
                      </p>
                      <h2 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em] text-slate-950">
                        Ask with live context
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                        The answer writes into the main canvas while the modal keeps prompts, history, and scope controls together in one place.
                      </p>
                    </div>

                    <Button size="sm" color="secondary" onClick={onClose}>
                      Close
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <BadgeWithDot type="pill-color" size="sm" color="brand">
                      {scopeLabel}
                    </BadgeWithDot>
                    <BadgeWithDot type="pill-color" size="sm" color="gray">
                      {userTurnsCount} / {USER_TURN_LIMIT} turns
                    </BadgeWithDot>
                  </div>
                </div>

                <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
                  <SectionCard title="Suggested prompts">
                    <div className="space-y-2">
                      {suggestions.map((suggestion) => (
                        <PromptCard
                          key={suggestion}
                          prompt={suggestion}
                          onClick={() => onUseSuggestion(suggestion)}
                        />
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Conversation"
                    action={
                      turns.length > 0 ? (
                        <Button size="xs" color="tertiary" onClick={onReset}>
                          Reset
                        </Button>
                      ) : null
                    }
                  >
                    {turns.length === 0 ? (
                      <EmptyState size="sm" className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8">
                        <EmptyState.Header pattern="none">
                          <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                        </EmptyState.Header>
                        <EmptyState.Content>
                          <EmptyState.Title>Ask from the current context</EmptyState.Title>
                          <EmptyState.Description>
                            The answer will replace the main canvas and line up its cited cards in the evidence column.
                          </EmptyState.Description>
                        </EmptyState.Content>
                      </EmptyState>
                    ) : (
                      <div className="space-y-3">
                        {turns.map((turn, index) => (
                          <div
                            key={`${turn.role}-${index}`}
                            className={cn(
                              "rounded-2xl border px-4 py-3",
                              turn.role === "user"
                                ? "border-utility-brand-200 bg-utility-brand-50"
                                : "border-slate-200 bg-slate-50/70",
                            )}
                          >
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                              {turn.role === "user" ? "You" : "Assistant"}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-slate-700">
                              {turn.role === "assistant" ? summarizeText(turn.content, 280) : turn.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>

              <div className="flex flex-col px-5 py-5">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Ask or search the corpus
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onSubmit();
                    }}
                    className="mt-4 space-y-4"
                  >
                    <TextAreaBase
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      rows={10}
                      disabled={pending || reachedTurnLimit}
                      placeholder={
                        reachedTurnLimit
                          ? "Conversation limit reached. Reset to ask another question."
                          : "Ask about the current theme, position, source, or the wider corpus..."
                      }
                      className="min-h-52 resize-none"
                    />

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-slate-500">
                        Cmd/Ctrl + Enter to submit
                      </p>

                      <Button
                        type="submit"
                        size="sm"
                        color="primary"
                        iconTrailing={ArrowRight}
                        disabled={pending || reachedTurnLimit || !input.trim()}
                      >
                        {pending ? "Asking" : "Ask"}
                      </Button>
                    </div>
                  </form>
                </div>

                {pending ? (
                  <div className="mt-4 rounded-2xl border border-utility-brand-200 bg-utility-brand-50 px-4 py-3 text-sm text-utility-brand-700">
                    Thinking through the evidence...
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-4 rounded-2xl border border-utility-red-200 bg-utility-red-50 px-4 py-3 text-sm text-utility-red-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ContentSection({
  kicker,
  title,
  meta,
  children,
}: {
  kicker: string;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{kicker}</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
        </div>
        {meta ? (
          <Badge type="color" size="sm" color="gray">
            {meta}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SectionCard({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          {meta ? (
            <Badge type="color" size="sm" color="gray">
              {meta}
            </Badge>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ActionCard({
  eyebrow,
  title,
  description,
  cta,
  onClick,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
    >
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
      <p className="mt-3 text-xl font-semibold tracking-[-0.02em] text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-utility-brand-700">
        {cta}
        <ArrowRight className="size-4 transition group-hover:translate-x-1" />
      </div>
    </button>
  );
}

function PositionRow({
  position,
  onOpen,
  compact = false,
}: {
  position: any;
  onOpen: () => void;
  compact?: boolean;
}) {
  const stance = position.currentVersion?.currentStance ?? position.currentStance;
  const confidenceLevel =
    position.currentVersion?.confidenceLevel ?? position.confidenceLevel ?? null;
  const status = position.currentVersion?.status ?? position.status ?? null;
  const versionDate = position.currentVersion?.versionDate ?? position.versionDate ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge type="color" size="sm" color="gray">
              {position.themeTitle ?? "Position"}
            </Badge>
            {status ? <StatusBadge status={status} /> : null}
            {confidenceLevel ? <ConfidenceBadge confidence={confidenceLevel} /> : null}
          </div>

          <p className="mt-3 text-base font-semibold leading-7 text-slate-950">{position.title}</p>
          {stance ? (
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {summarizeText(stance, compact ? 160 : 220)}
            </p>
          ) : null}
          {versionDate ? (
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Updated {formatDateLabel(versionDate)}
            </p>
          ) : null}
        </div>

        <div className="inline-flex items-center gap-2 text-sm font-semibold text-utility-brand-700">
          Open
          <ArrowRight className="size-4 transition group-hover:translate-x-1" />
        </div>
      </div>
    </button>
  );
}

function PromptCard({
  prompt,
  onClick,
}: {
  prompt: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-slate-700">{prompt}</p>
        <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-utility-brand-700" />
      </div>
    </button>
  );
}

function EmptyPaneState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <EmptyState
      size="md"
      className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10"
    >
      <EmptyState.Header pattern="none">
        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
      </EmptyState.Header>
      <EmptyState.Content>
        <EmptyState.Title>{title}</EmptyState.Title>
        <EmptyState.Description>{description}</EmptyState.Description>
      </EmptyState.Content>
    </EmptyState>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[24rem] items-center justify-center">
      <LoadingIndicator type="line-simple" size="lg" label="Loading workspace" />
    </div>
  );
}

function sectionsCountBadge(sections: EvidenceSection[]) {
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  return total > 0 ? (
    <Badge type="color" size="sm" color="gray">
      {total} records
    </Badge>
  ) : null;
}

function comparePositionsByFreshness(left: any, right: any) {
  const leftTime = left.currentVersion?.versionDate
    ? Date.parse(left.currentVersion.versionDate)
    : 0;
  const rightTime = right.currentVersion?.versionDate
    ? Date.parse(right.currentVersion.versionDate)
    : 0;

  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(left.title ?? "").localeCompare(String(right.title ?? ""));
}

function getThemePosture(themePositions: any[]) {
  const statusCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  let latestVersionDate: string | null = null;

  for (const position of themePositions) {
    const status = position.currentVersion?.status;
    if (status) {
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }

    const confidence = position.currentVersion?.confidenceLevel;
    if (confidence) {
      confidenceCounts.set(confidence, (confidenceCounts.get(confidence) ?? 0) + 1);
    }

    const versionDate = position.currentVersion?.versionDate;
    if (
      versionDate &&
      (!latestVersionDate || Date.parse(versionDate) > Date.parse(latestVersionDate))
    ) {
      latestVersionDate = versionDate;
    }
  }

  const statusSummary =
    summarizeCounts(statusCounts, ["active", "emerging", "established", "evolved", "retired"]) ??
    "no status signals yet";
  const confidenceSummary =
    summarizeCounts(confidenceCounts, ["established", "active", "emerging"]) ??
    "not yet classified";

  return {
    statusSummary,
    confidenceSummary,
    latestFreshness: latestVersionDate ? formatDateLabel(latestVersionDate) : "No dated movement yet",
    cards: [
      {
        label: "Current mix",
        value: statusSummary,
        description: "A quick read on how mature or in-motion the positions inside this theme are.",
      },
      {
        label: "Confidence",
        value: confidenceSummary,
        description: "Shows whether the theme is still emerging, actively forming, or already established.",
      },
      {
        label: "Freshest update",
        value: latestVersionDate ? formatDateLabel(latestVersionDate) : "No version dates yet",
        description: "Use freshness to decide which positions are most likely to reward immediate review.",
      },
    ],
  };
}

function summarizeCounts(counts: Map<string, number>, priorityOrder: string[]) {
  const orderedEntries = priorityOrder
    .map((key) => [key, counts.get(key) ?? 0] as const)
    .filter(([, count]) => count > 0);

  if (!orderedEntries.length) return null;
  return orderedEntries.map(([label, count]) => `${count} ${label}`).join(" · ");
}

function formatDateLabel(dateString: string) {
  const parsed = Date.parse(dateString);
  if (Number.isNaN(parsed)) return dateString;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
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
      blocks.push(<hr key={`rule-${index}`} className="border-t border-slate-200" />);
      index += 1;
      continue;
    }

    const headingMatch = current.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineRichText(headingMatch[2], citationMap, onCitationClick);

      if (level === 1) {
        blocks.push(
          <h1 key={`heading-${index}`} className="text-display-xs font-semibold tracking-[-0.02em] text-slate-950">
            {content}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`heading-${index}`} className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">
            {content}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={`heading-${index}`} className="text-xl font-semibold text-slate-950">
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
        <blockquote
          key={`quote-${index}`}
          className="rounded-2xl border border-utility-brand-200 bg-utility-brand-50 px-4 py-3 text-sm leading-7 text-slate-700"
        >
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
            <li key={`${item}-${itemIndex}`} className="flex items-start gap-3">
              <span className="mt-3 size-1.5 rounded-full bg-utility-brand-500" />
              <span>{renderInlineRichText(item, citationMap, onCitationClick)}</span>
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
        <ol key={`ordered-${index}`} className="list-decimal space-y-3 pl-5">
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
      <p key={`paragraph-${index}`} className="text-base leading-8 text-slate-700">
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
          className="mx-1 inline-flex rounded-full border border-utility-brand-200 bg-utility-brand-50 px-2.5 py-1 text-xs font-semibold text-utility-brand-700"
          onClick={() => onCitationClick(dataPointId)}
        >
          {part}
        </button>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.95em] text-slate-900"
        >
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
}: {
  activeAnswer: AssistantAnswer | null;
  activeTheme: any;
  positionDetail: any;
  sourceDetail: any;
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
        "The evidence column shows every data point linked to this source so you can inspect provenance without leaving the reading flow.",
      emptyTitle: "No extracted claims yet",
      emptyDescription:
        "This source has not produced linked data points yet.",
    };
  }

  if (activeTheme) {
    return {
      title: "Evidence will follow the position you open",
      description:
        "Themes organize positions, but the evidence column becomes active once you open a position or ask a grounded question inside that theme.",
      emptyTitle: "Choose a position to inspect",
      emptyDescription:
        "Open one of this theme’s positions to bring supporting evidence into view.",
    };
  }

  return {
    title: "Evidence column",
    description:
      "The evidence column stays reserved for claims, quotes, and provenance tied to whatever you are reading or asking.",
    emptyTitle: "No evidence in view",
    emptyDescription:
      "Open a position, inspect a source, or ask a grounded question to populate this pane.",
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
  if (pathname === "/browse") return "browse";
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
  if (routeKind === "browse") return "Theme browser";
  return "Workspace overview";
}

function getMainPaneTitle(
  routeKind: RouteKind,
  activeTheme: any,
  positionDetail: any,
  sourceDetail: any,
) {
  if (routeKind === "browse") return "Browse research themes";
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
  if (routeKind === "browse") {
    return "Use the browse rail to scan themes, then review the selected thread as a structured detail surface without leaving the workspace shell.";
  }

  if (positionDetail) {
    return "Read the current stance here while the evidence column keeps the supporting and counter-signals in view.";
  }

  if (sourceDetail) {
    return "Inspect the source record here while extracted evidence remains visible beside it.";
  }

  if (activeTheme) {
    return "Themes gather multiple positions under one strategic thread. Open any position to move from exploration into evidence review.";
  }

  if (routeKind === "ask") {
    return "Questions start in grounded chat. The answer is written here, with citations opening the evidence cards beside it.";
  }

  return "This workspace keeps reading and evidence stable, then layers grounded chat on top only when you need synthesis.";
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

  if (routeKind === "browse") {
    return [
      "Which theme has the strongest current research posture?",
      "Where are the most active positions right now?",
      "Which theme looks under-developed and needs more evidence?",
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
