import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProject } from "@/ProjectContext";
import { api, type Id } from "@/api";
import {
  getRouteKind,
  getScopeLabel,
  USER_TURN_LIMIT,
  type AssistantAnswer,
  type Turn,
  type RouteKind,
  type EvidenceSection,
} from "@/lib/workspace-utils";

type WorkspaceState = {
  /* project */
  projectId: Id<"projects"> | null;
  projectName: string | null;
  loading: boolean;
  /* routing */
  routeKind: RouteKind;
  scopeLabel: string;
  navigate: (path: string) => void;
  /* data */
  themes: any[] | undefined;
  allPositions: any[] | undefined;
  themePositions: any[] | undefined;
  positionDetail: any | undefined;
  sourceDetail: any | undefined;
  activeTheme: any | null;
  /* chat */
  turns: Turn[];
  activeAnswer: AssistantAnswer | null;
  input: string;
  setInput: (v: string) => void;
  pending: boolean;
  error: string | null;
  handleAskQuestion: (questionText?: string) => Promise<void>;
  resetConversation: () => void;
  userTurnsCount: number;
  reachedTurnLimit: boolean;
  /* evidence highlighting */
  highlightedEvidenceId: string | null;
  handleCitationClick: (dpId: string) => void;
  evidenceSections: EvidenceSection[];
  /* mobile */
  mobilePane: "main" | "chat";
  setMobilePane: (p: "main" | "chat") => void;
};

const Ctx = createContext<WorkspaceState | null>(null);

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { projectId, projectName, loading } = useProject();
  const location = useLocation();

  // Parse route params from pathname so WorkspaceProvider can live above <Routes>.
  const routeKind = getRouteKind(location.pathname);
  const themeRecordId = location.pathname.match(/^\/themes\/([^/]+)/)?.[1] as Id<"researchThemes"> | undefined;
  const positionRecordId = location.pathname.match(/^\/positions\/([^/]+)/)?.[1] as Id<"researchPositions"> | undefined;
  const sourceRecordId = location.pathname.match(/^\/sources\/([^/]+)/)?.[1] as Id<"sources"> | undefined;

  /* ── Convex queries ── */
  const askGrounded = useAction(api.chat.askGrounded);
  const themes = useQuery(api.positions.getThemes, projectId ? { projectId } : "skip");
  const allPositions = useQuery(api.positions.listAllPositions, projectId ? {} : "skip");
  const themePositions = useQuery(api.positions.getPositionsByTheme, themeRecordId ? { themeId: themeRecordId } : "skip");
  const positionDetail = useQuery(api.positions.getPositionDetail, positionRecordId ? { positionId: positionRecordId } : "skip");
  const sourceDetail = useQuery(api.sources.getSourceDetail, sourceRecordId ? { sourceId: sourceRecordId } : "skip");

  const activeTheme = useMemo(() => {
    if (!themes) return null;
    if (themeRecordId) return themes.find((t: any) => String(t._id) === themeRecordId) ?? null;
    if (positionDetail?.theme) return positionDetail.theme;
    return null;
  }, [themes, themeRecordId, positionDetail]);

  const scopeLabel = getScopeLabel({ activeTheme, positionDetail, sourceDetail });

  /* ── Chat state ── */
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeAnswer, setActiveAnswer] = useState<AssistantAnswer | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"main" | "chat">("main");

  const userTurnsCount = turns.filter((t) => t.role === "user").length;
  const reachedTurnLimit = userTurnsCount >= USER_TURN_LIMIT;

  // Chat always searches the full corpus — no route-based scoping
  const scopeArgs = useMemo(() => ({}), []);

  async function handleAskQuestion(questionText?: string) {
    const question = (questionText ?? input).trim();
    if (!projectId || !question || pending || reachedTurnLimit) return;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    const userTurn: Turn = { role: "user", content: question };
    const nextTurns = [...turns, userTurn];

    setTurns(nextTurns);
    setInput("");
    setPending(true);
    setError(null);

    try {
      const result = (await askGrounded({
        question,
        projectId,
        conversationHistory: history,
        ...scopeArgs,
      })) as any;

      const answerState: AssistantAnswer = {
        question,
        answer: result.answer,
        citations: result.citations ?? [],
        citedDataPointIds: result.citedDataPointIds ?? [],
        retrievedDataPoints: result.retrievedDataPoints ?? [],
        scopeLabel,
      };

      setTurns([...nextTurns, { role: "assistant", content: result.answer, answerState }]);
      setActiveAnswer(answerState);
      setHighlightedEvidenceId(answerState.citedDataPointIds[0] ?? answerState.retrievedDataPoints[0]?._id ?? null);
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

  function handleCitationClick(dpId: string) {
    setHighlightedEvidenceId(dpId);
  }

  /* ── Evidence sections ── */
  const evidenceSections = useMemo<EvidenceSection[]>(() => {
    if (activeAnswer) {
      const citedSet = new Set(activeAnswer.citedDataPointIds);
      const cited = activeAnswer.retrievedDataPoints.filter((dp: any) => citedSet.has(dp._id));
      const retrieved = activeAnswer.retrievedDataPoints.filter((dp: any) => !citedSet.has(dp._id));
      const citedLabelByDpId: Record<string, string> = {};
      for (const c of activeAnswer.citations ?? []) {
        if (c.dataPointId && c.label) citedLabelByDpId[c.dataPointId] = c.label;
      }
      return [
        { key: "cited", title: "Cited in the answer", subtitle: "Directly cited in the current response.", items: cited, cited: true, labelByDpId: citedLabelByDpId },
        { key: "retrieved", title: "Retrieved for context", subtitle: "Adjacent evidence used to ground the answer.", items: retrieved },
      ].filter((s) => s.items.length > 0);
    }
    if (positionDetail?.currentVersion) {
      const supportLabels: Record<string, string> = {};
      (positionDetail.currentVersion.supportingEvidenceDetails ?? []).forEach((dp: any, i: number) => {
        if (dp?._id) supportLabels[dp._id] = `E${i + 1}`;
      });
      const counterLabels: Record<string, string> = {};
      (positionDetail.currentVersion.counterEvidenceDetails ?? []).forEach((dp: any, i: number) => {
        if (dp?._id) counterLabels[dp._id] = `C${i + 1}`;
      });
      return [
        { key: "support", title: "Supporting evidence", subtitle: "Evidence attached to this position version.", items: positionDetail.currentVersion.supportingEvidenceDetails ?? [], labelByDpId: supportLabels },
        { key: "counter", title: "Counter evidence", subtitle: "Signals that narrow, qualify, or challenge the current stance.", items: positionDetail.currentVersion.counterEvidenceDetails ?? [], variant: "counter" as const, labelByDpId: counterLabels },
      ].filter((s) => s.items.length > 0);
    }
    if (sourceDetail) {
      return [{ key: "source", title: "Linked data points", subtitle: "Claims extracted from this source.", items: sourceDetail.dataPoints ?? [] }].filter((s) => s.items.length > 0);
    }
    return [];
  }, [activeAnswer, positionDetail, sourceDetail]);

  const value = useMemo<WorkspaceState>(
    () => ({
      projectId,
      projectName,
      loading,
      routeKind,
      scopeLabel,
      navigate: nav,
      themes,
      allPositions,
      themePositions,
      positionDetail,
      sourceDetail,
      activeTheme,
      turns,
      activeAnswer,
      input,
      setInput,
      pending,
      error,
      handleAskQuestion,
      resetConversation,
      userTurnsCount,
      reachedTurnLimit,
      highlightedEvidenceId,
      handleCitationClick,
      evidenceSections,
      mobilePane,
      setMobilePane,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, projectName, loading, routeKind, scopeLabel, themes, allPositions, themePositions, positionDetail, sourceDetail, activeTheme, turns, activeAnswer, input, pending, error, userTurnsCount, reachedTurnLimit, highlightedEvidenceId, evidenceSections, mobilePane],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
