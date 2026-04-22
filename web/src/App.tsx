import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MobileRedirect } from "./components/MobileRedirect";
import { ProjectProvider } from "./ProjectContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import AppShell from "./layouts/AppShell";
import LandingPage from "./pages/LandingPage";
import MethodologyPage from "./pages/MethodologyPage";
import ThemeWorkspaceLayout from "./layouts/ThemeWorkspaceLayout";
import ThemePage from "./pages/ThemePage";
import PositionPage from "./pages/PositionPage";
import PositionRedirect from "./components/PositionRedirect";
import SourcePage from "./pages/SourcePage";
import AskPage from "./pages/AskPage";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * Watches the viewport and returns true at 1024px and up.
 * Drives the mobile-redirect vs full-app gate below.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

export default function App() {
  const isDesktop = useIsDesktop();

  // Skip the providers and router on small viewports: the data fetches
  // are wasted effort if the visitor is never going to see the app.
  if (!isDesktop) {
    return <MobileRedirect />;
  }

  return (
    <ProjectProvider>
      <WorkspaceProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/themes/:themeId" element={<ThemeWorkspaceLayout />}>
              <Route index element={<ThemePage />} />
              <Route path="positions/:positionId" element={<PositionPage />} />
            </Route>
            {/* Legacy flat URL redirects to the nested shape. */}
            <Route path="/positions/:positionId" element={<PositionRedirect />} />
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
