import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { ProjectProvider, useProject } from "./ProjectContext";
import HomePage from "./pages/HomePage";
import BrowsePage from "./pages/BrowsePage";
import ThemePage from "./pages/ThemePage";
import PositionPage from "./pages/PositionPage";
import ChatPage from "./pages/ChatPage";
import SourcePage from "./pages/SourcePage";

function Header() {
  const { projectName } = useProject();
  const loc = useLocation();
  const onHome = loc.pathname === "/";
  return (
    <header className="relative z-10 border-b border-rule/70">
      <div className="mx-auto flex max-w-6xl items-end justify-between px-6 py-6 md:px-10">
        <Link to="/" className="group">
          <div className="label text-inkMute">A research curation system</div>
          <div className="display-tight mt-1 text-3xl text-ink md:text-4xl">
            Curate <span className="italic text-ochreDeep">Mind</span>
          </div>
          {projectName && !onHome && (
            <div className="mt-1 text-xs text-inkMute font-mono">
              {projectName}
            </div>
          )}
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <NavLink
            to="/browse"
            className={({ isActive }) =>
              `label transition-colors ${
                isActive ? "text-ochreDeep" : "text-inkSoft hover:text-ink"
              }`
            }
          >
            Browse
          </NavLink>
          <NavLink
            to="/ask"
            className={({ isActive }) =>
              `label transition-colors ${
                isActive ? "text-ochreDeep" : "text-inkSoft hover:text-ink"
              }`
            }
          >
            Ask
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-rule/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-xs text-inkMute md:flex-row md:items-center md:justify-between md:px-10">
        <div>
          Curate Mind · Personal research curation · February 2026 corpus
        </div>
        <div className="font-mono">
          Maicol Parker-Chavez · AI strategy &amp; adoption
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <div className="paper-grain relative min-h-screen">
        <Header />
        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/themes/:themeId" element={<ThemePage />} />
            <Route path="/positions/:positionId" element={<PositionPage />} />
            <Route path="/sources/:sourceId" element={<SourcePage />} />
            <Route path="/ask" element={<ChatPage />} />
            <Route
              path="*"
              element={
                <div className="mx-auto max-w-3xl px-6 py-24 text-center">
                  <div className="display text-3xl">Not found.</div>
                  <Link to="/" className="label mt-6 inline-block text-ochreDeep">
                    ← back home
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </ProjectProvider>
  );
}
