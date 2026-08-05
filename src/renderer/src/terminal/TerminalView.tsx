import { useEffect } from "react";
import { onOpenTerminalTab } from "../lib/bus.js";
import { useTabs } from "../store.js";
import { TerminalPane } from "./TerminalPane.js";

// Panes only — the sidebar is the session switcher (per the deck design).
export function TerminalView({ visible }: { visible: boolean }) {
  const { tabs, activeId, newTab, setTitle } = useTabs();

  useEffect(() => onOpenTerminalTab((detail) => void newTab(detail)), [newTab]);

  // First shell on mount.
  useEffect(() => {
    if (tabs.length === 0) void newTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`min-h-0 flex-1 p-2 ${visible ? "" : "hidden"}`}>
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
    </div>
  );
}
