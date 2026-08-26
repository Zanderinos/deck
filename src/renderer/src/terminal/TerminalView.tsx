import { useEffect, useState } from "react";
import { onOpenTerminalTab } from "../lib/bus.js";
import { useAgentSessions } from "../lib/useSessions.js";
import { useTabs } from "../store.js";
import { ChangesPanel } from "./ChangesPanel.js";
import { TerminalPane } from "./TerminalPane.js";

// Panes only — the sidebar is the session switcher (per the deck design).
export function TerminalView({ visible }: { visible: boolean }) {
  const { tabs, activeId, ready, newTab, setTitle } = useTabs();
  const sessions = useAgentSessions();
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => onOpenTerminalTab((detail) => void newTab(detail)), [newTab]);

  // First shell, once we know no earlier ones survived the reload.
  useEffect(() => {
    if (ready && tabs.length === 0) void newTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const activeTab = tabs.find((t) => t.termId === activeId);
  // listSessions is ordered by recency, so find() picks the live session.
  const session = sessions.find((s) => s.term_id === activeId);
  const needsReview = session?.status === "needs_review";

  // A review request opens the panel by itself.
  useEffect(() => {
    if (needsReview) setPanelOpen(true);
  }, [needsReview, activeId]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setPanelOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <div className={`min-h-0 flex-1 ${visible ? "flex" : "hidden"}`}>
      <div className="relative min-h-0 min-w-0 flex-1 p-2">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.termId}
            termId={tab.termId}
            active={visible && tab.termId === activeId}
            onTitle={(title) => setTitle(tab.termId, title)}
          />
        ))}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-dim">
            ⌘T for a new session
          </div>
        )}
        {!panelOpen && tabs.length > 0 && (
          <button
            onClick={() => setPanelOpen(true)}
            title="Show working-tree changes (⌘E)"
            className={`absolute right-3 top-3 rounded-md border px-2 py-0.5 text-[10px] ${
              needsReview
                ? "border-orange/50 bg-orange/10 text-orange"
                : "border-edge2 bg-panel/80 text-dim hover:text-ink"
            }`}
          >
            ◆ {needsReview ? "needs review" : "changes"} ⌘E
          </button>
        )}
      </div>
      {panelOpen && (
        <ChangesPanel
          cwd={session?.cwd ?? activeTab?.cwd}
          session={session}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
