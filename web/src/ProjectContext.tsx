import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api, Doc, Id } from "./api";
import { ENV_PROJECT_ID } from "./convex";

type Ctx = {
  projectId: Id<"projects"> | null;
  projectName: string | null;
  assistantRoleName: string;
  suggestedPrompts: string[];
  loading: boolean;
};

const ProjectCtx = createContext<Ctx>({
  projectId: null,
  projectName: null,
  assistantRoleName: "research assistant",
  suggestedPrompts: [],
  loading: true,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  // If env supplies a project ID, prefer it. Otherwise pick the first project.
  const envId = ENV_PROJECT_ID || null;
  const projects = useQuery(api.projects.listProjects, envId ? "skip" : {});
  const selectedProjectId = (envId ?? projects?.[0]?._id ?? null) as Id<"projects"> | null;
  const project = useQuery(
    api.projects.getProjectProfile,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );

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
