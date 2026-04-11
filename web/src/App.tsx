import { Navigate, Route, Routes } from "react-router-dom";
import { ProjectProvider } from "./ProjectContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import AppShell from "./layouts/AppShell";
import LandingPage from "./pages/LandingPage";
import ThemePage from "./pages/ThemePage";
import PositionPage from "./pages/PositionPage";
import SourcePage from "./pages/SourcePage";

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        {/* All workspace routes share the shell + context */}
        <Route
          path="/"
          element={
            <WorkspaceProvider>
              <AppShell>
                <LandingPage />
              </AppShell>
            </WorkspaceProvider>
          }
        />
        <Route
          path="/themes/:themeId"
          element={
            <WorkspaceProvider>
              <AppShell>
                <ThemePage />
              </AppShell>
            </WorkspaceProvider>
          }
        />
        <Route
          path="/positions/:positionId"
          element={
            <WorkspaceProvider>
              <AppShell>
                <PositionPage />
              </AppShell>
            </WorkspaceProvider>
          }
        />
        <Route
          path="/sources/:sourceId"
          element={
            <WorkspaceProvider>
              <AppShell>
                <SourcePage />
              </AppShell>
            </WorkspaceProvider>
          }
        />
        {/* Legacy routes redirect */}
        <Route path="/browse" element={<Navigate to="/" replace />} />
        <Route path="/ask" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProjectProvider>
  );
}
