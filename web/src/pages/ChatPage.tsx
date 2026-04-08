import { Link } from "react-router-dom";
import { useProject } from "../ProjectContext";
import ChatInterface from "../components/ChatInterface";

export default function ChatPage() {
  const { projectId, loading } = useProject();

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 md:px-10">
      <Link to="/" className="label text-inkMute hover:text-ochreDeep">
        ← home
      </Link>
      <header className="mt-6 max-w-3xl">
        <div className="label text-ochreDeep">Grounded chat</div>
        <h1 className="display-tight mt-3 text-5xl text-ink md:text-6xl">
          Ask the corpus.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-inkSoft">
          Each answer is generated from the data points retrieved for your
          question and shown alongside the lineage that grounds it. Two to
          three turns per conversation.
        </p>
      </header>

      <section className="mt-12 h-[70vh] min-h-[36rem] rounded-sm border border-rule bg-paper/40 p-6 md:p-8">
        {loading || !projectId ? (
          <div className="flex h-full items-center justify-center text-inkMute">
            Loading project…
          </div>
        ) : (
          <ChatInterface projectId={projectId} />
        )}
      </section>
    </div>
  );
}
