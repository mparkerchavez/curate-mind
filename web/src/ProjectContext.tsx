import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api, Doc, Id } from "./api";
import { ENV_PROJECT_ID } from "./convex";

type Ctx = {
  projectId: Id<"projects"> | null;
  projectName: string | null;
  assistantRoleName: string;
  suggestedPrompts: string[];
  corpusStats: {
    sourceCount: number;
    dataPointCount: number;
    lastUpdatedByTheme: Record<string, string>;
  } | null;
  loading: boolean;
};

const ProjectCtx = createContext<Ctx>({
  projectId: null,
  projectName: null,
  assistantRoleName: "research assistant",
  suggestedPrompts: [],
  corpusStats: null,
  loading: true,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  // If env supplies a project ID, prefer it. Otherwise pick the first project.
  const envId = ENV_PROJECT_ID || null;
  const [corpusStats, setCorpusStats] = useState<Ctx["corpusStats"]>(null);
  const projects = useQuery(api.projects.listProjects, envId ? "skip" : {});
  const selectedProjectId = (envId ?? projects?.[0]?._id ?? null) as Id<"projects"> | null;
  const project = useQuery(
    api.projects.getProjectProfile,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/backend-snapshot.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Backend snapshot unavailable");
        return response.json();
      })
      .then((snapshot) => {
        if (cancelled) return;
        const counts = snapshot?.metadata?.counts;
        if (!counts) return;
        const lastUpdatedByTheme: Record<string, string> = {};
        for (const position of snapshot?.entities?.researchPositions ?? []) {
          const themeId = String(position.themeId ?? "");
          const date: string | undefined = position.currentVersion?.versionDate;
          if (!themeId || !date) continue;
          const existing = lastUpdatedByTheme[themeId];
          if (!existing || Date.parse(date) > Date.parse(existing)) {
            lastUpdatedByTheme[themeId] = date;
          }
        }
        setCorpusStats({
          sourceCount: counts.sources ?? 0,
          dataPointCount: counts.dataPoints ?? 0,
          lastUpdatedByTheme,
        });
      })
      .catch(() => {
        if (!cancelled) setCorpusStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading =
    (!envId && projects === undefined) ||
    (selectedProjectId !== null && project === undefined);
  const projectId = selectedProjectId;
  const projectName =
    project?.name ??
    projects?.find((p: Doc<"projects">) => p._id === selectedProjectId)?.name ??
    null;
  const assistantRoleName =
    project?.assistantRoleName?.trim() || "research assistant";
  const suggestedPrompts =
    project?.suggestedPrompts?.map((prompt: string) => prompt.trim()).filter(Boolean) ?? [];

  return (
    <ProjectCtx.Provider
      value={{
        projectId,
        projectName,
        assistantRoleName,
        suggestedPrompts,
        corpusStats,
        loading,
      }}
    >
      {children}
    </ProjectCtx.Provider>
  );
}

export function useProject() {
  return useContext(ProjectCtx);
}
