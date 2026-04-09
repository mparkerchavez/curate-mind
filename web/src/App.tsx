import { Route, Routes } from "react-router-dom";
import { ProjectProvider } from "./ProjectContext";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
        <Route path="/browse" element={<WorkspacePage />} />
        <Route path="/ask" element={<WorkspacePage />} />
        <Route path="/themes/:themeId" element={<WorkspacePage />} />
        <Route path="/positions/:positionId" element={<WorkspacePage />} />
        <Route path="/sources/:sourceId" element={<WorkspacePage />} />
        <Route path="*" element={<WorkspacePage />} />
      </Routes>
    </ProjectProvider>
  );
}
