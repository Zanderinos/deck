import { useCallback, useEffect, useState } from "react";
import { TerminalPane } from "./TerminalPane.js";

interface Tab {
  termId: string;
  title: string;
}

export function TerminalTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>();

  const newTab = useCallback(async (opts?: { cwd?: string; command?: string }) => {
    const termId = await window.deck.term.create(opts);
    setTabs((t) => [...t, { termId, title: "shell" }]);
    setActiveId(termId);
  }, []);

  const closeTab = useCallback((termId: string, kill = true) => {
    if (kill) window.deck.term.kill(termId);
    setTabs((tabs) => {
      const i = tabs.findIndex((t) => t.termId === termId);
      const next = tabs.filter((t) => t.termId !== termId);
      setActiveId((active) =>
        active === termId ? next[Math.min(i, next.length - 1)]?.termId : active,
      );
      return next;
    });
  }, []);

  // First tab on mount; guarded so a dev-mode double effect doesn't spawn two.
  useEffect(() => {
    let cancelled = false;
    setTabs((tabs) => {
      if (tabs.length === 0 && !cancelled) void newTab();
      return tabs;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => window.deck.term.onExit((id) => closeTab(id, false)), [closeTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "t") {
        e.preventDefault();
        void newTab();
      } else if (e.key === "w" && activeId) {
        e.preventDefault();
        closeTab(activeId);
      } else if (e.key >= "1" && e.key <= "9") {
        const tab = tabs[Number(e.key) - 1];
        if (tab) {
          e.preventDefault();
          setActiveId(tab.termId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, tabs, newTab, closeTab]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-edge px-2 drag-region">
        {tabs.map((tab) => (
          <div
            key={tab.termId}
            onClick={() => setActiveId(tab.termId)}
            className={`group flex h-6 max-w-48 cursor-default items-center gap-1.5 rounded px-2 text-xs ${
              tab.termId === activeId ? "bg-edge text-ink" : "text-dim hover:text-ink"
            }`}
          >
            <span className="truncate">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.termId);
              }}
              className="hidden text-dim hover:text-ink group-hover:block"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => void newTab()}
          title="New tab (⌘T)"
          className="flex h-6 w-6 items-center justify-center rounded text-dim hover:bg-edge hover:text-ink"
        >
          +
        </button>
      </div>
      <div className="min-h-0 flex-1 p-1.5">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.termId}
            termId={tab.termId}
            active={tab.termId === activeId}
            onTitle={(title) =>
              setTabs((tabs) => tabs.map((t) => (t.termId === tab.termId ? { ...t, title } : t)))
            }
          />
        ))}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-dim">
            ⌘T to open a terminal
          </div>
        )}
      </div>
    </div>
  );
}
