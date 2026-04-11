import { type ReactNode } from "react";
import { LayersThree01 } from "@untitledui/icons";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import ResearchSidebar from "@/components/ResearchSidebar";
import ChatPanel from "@/components/ChatPanel";

export default function AppShell({ children }: { children: ReactNode }) {
  const { mobilePane, setMobilePane } = useWorkspace();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 lg:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-solid text-white shadow-xs-skeuomorphic">
            <LayersThree01 className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-[-0.02em] text-slate-950">
            Curate Mind
          </span>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <Tabs
          selectedKey={mobilePane}
          onSelectionChange={(key) => setMobilePane(String(key) as "main" | "chat")}
        >
          <TabList
            size="sm"
            type="button-border"
            items={[
              { id: "main", children: "Explore" },
              { id: "chat", children: "Ask" },
            ]}
          />
        </Tabs>
      </div>

      {/* Three-panel body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
          <ResearchSidebar />
        </aside>

        {/* Main canvas */}
        <main className={`min-w-0 flex-1 overflow-y-auto ${mobilePane !== "main" ? "hidden lg:block" : ""}`}>
          {children}
        </main>

        {/* Chat panel — hidden on mobile when not active */}
        <aside className={`w-full shrink-0 overflow-y-auto border-l border-slate-200 bg-white lg:w-[400px] ${mobilePane !== "chat" ? "hidden lg:block" : ""}`}>
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}
