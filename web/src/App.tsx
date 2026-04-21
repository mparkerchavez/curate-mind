import { Navigate, Route, Routes } from "react-router-dom";
import { ProjectProvider } from "./ProjectContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import AppShell from "./layouts/AppShell";
import LandingPage from "./pages/LandingPage";
import MethodologyPage from "./pages/MethodologyPage";
import ThemePage from "./pages/ThemePage";
import PositionPage from "./pages/PositionPage";
import SourcePage from "./pages/SourcePage";
import AskPage from "./pages/AskPage";

export default function App() {
  return (
    <ProjectProvider>
      <WorkspaceProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/themes/:themeId" element={<ThemePage />} />
            <Route path="/positions/:positionId" element={<PositionPage />} />
            <Route path="/sources/:sourceId" element={<SourcePage />} />
            {/* Legacy routes redirect */}
            <Route path="/browse" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </WorkspaceProvider>
    </ProjectProvider>
  );
}
