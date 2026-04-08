import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api, Doc, Id } from "./api";
import { ENV_PROJECT_ID } from "./convex";

type Ctx = {
  projectId: Id<"projects"> | null;
  projectName: string | null;
  loading: boolean;
};

const ProjectCtx = createContext<Ctx>({
  projectId: null,
  projectName: null,
  loading: true,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  // If env supplies a project ID, prefer it. Otherwise pick the first project.
  const projects = useQuery(api.projects.listProjects, {});
  const envId = ENV_PROJECT_ID || null;

  let projectId: Id<"projects"> | null = null;
  let projectName: string | null = null;
  let loading = true;

  if (envId) {
    projectId = envId as Id<"projects">;
    projectName =
      projects?.find((p: Doc<"projects">) => p._id === envId)?.name ?? null;
    loading = projects === undefined;
  } else if (projects !== undefined) {
    loading = false;
    if (projects.length > 0) {
      projectId = projects[0]._id as Id<"projects">;
      projectName = projects[0].name;
    }
  }

  return (
    <ProjectCtx.Provider value={{ projectId, projectName, loading }}>
      {children}
    </ProjectCtx.Provider>
  );
}

export function useProject() {
  return useContext(ProjectCtx);
}
