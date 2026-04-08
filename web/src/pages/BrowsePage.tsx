import { Link } from "react-router-dom";
import { useProject } from "../ProjectContext";
import ThemeGrid from "../components/ThemeGrid";

export default function BrowsePage() {
  const { projectId, loading } = useProject();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <Link to="/" className="label text-inkMute hover:text-ochreDeep">
        ← home
      </Link>
      <header className="mt-6 max-w-3xl">
        <div className="label text-ochreDeep">Layer 1 · Themes</div>
        <h1 className="display-tight mt-3 text-5xl text-ink md:text-6xl">
          Browse the corpus.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-inkSoft">
          Themes are macro areas. Each one holds a small set of versioned
          positions. Pick a thread to follow it down to the source.
        </p>
      </header>

      <section className="mt-14">
        {loading || !projectId ? (
          <div className="rounded-sm border border-rule/70 p-10 text-center text-inkMute">
            Loading project…
          </div>
        ) : (
          <ThemeGrid projectId={projectId} />
        )}
      </section>
    </div>
  );
}
