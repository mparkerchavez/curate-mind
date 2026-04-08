import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api, Doc, Id } from "../api";
import { useProject } from "../ProjectContext";
import PositionList from "../components/PositionList";

export default function ThemePage() {
  const { themeId } = useParams<{ themeId: string }>();
  const { projectId } = useProject();
  const themes = useQuery(
    api.positions.getThemes,
    projectId ? { projectId } : "skip"
  );

  const theme = themes?.find(
    (t: Doc<"researchThemes"> & { positionCount: number }) => t._id === themeId
  );
  const tid = themeId as Id<"researchThemes">;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <Link to="/browse" className="label text-inkMute hover:text-ochreDeep">
        ← all themes
      </Link>

      <header className="mt-6 max-w-3xl">
        <div className="label text-ochreDeep">Theme</div>
        <h1 className="display-tight mt-3 text-5xl text-ink md:text-6xl">
          {theme?.title ?? "…"}
        </h1>
        {theme?.description && (
          <p className="mt-5 text-base leading-relaxed text-inkSoft">
            {theme.description}
          </p>
        )}
      </header>

      <section className="mt-14">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="display text-2xl text-ink">Positions</h2>
          {typeof theme?.positionCount === "number" && (
            <span className="label text-inkMute">
              {theme.positionCount}{" "}
              {theme.positionCount === 1 ? "position" : "positions"}
            </span>
          )}
        </div>
        <PositionList themeId={tid} />
      </section>
    </div>
  );
}
