import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckSettings } from "../../shared/settings.js";
import { AgentsView } from "./agents/AgentsView.js";
import { BoardView } from "./board/BoardView.js";
import { Sidebar } from "./chrome/Sidebar.js";
import { Titlebar } from "./chrome/Titlebar.js";
import { onOpenTerminalTab, requestNavBack } from "./lib/bus.js";
import { SearchOverlay } from "./search/SearchOverlay.js";
import { SearchView } from "./search/SearchView.js";
import { TabProvider, useTabs } from "./store.js";
import { TerminalView } from "./terminal/TerminalView.js";

export type View = "terminal" | "board" | "agents" | "search" | "settings";

export default function App() {
  return (
    <TabProvider>
      <Shell />
    </TabProvider>
  );
}

function Shell() {
  const [view, setViewRaw] = useState<View>("terminal");
  const [searchOpen, setSearchOpen] = useState(false);
  const [preview, setPreview] = useState<{ sessionId: string; query: string }>();
  const { newTab, closeTab, activeId } = useTabs();

  // View history for the mouse back/forward buttons.
  const history = useRef({ stack: ["terminal"] as View[], index: 0 });
  const setView = useCallback((v: View) => {
    setViewRaw((current) => {
      if (v !== current) {
        const h = history.current;
        h.stack = [...h.stack.slice(0, h.index + 1), v];
        h.index = h.stack.length - 1;
      }
      return v;
    });
  }, []);
  const goBack = useCallback(() => {
    if (requestNavBack()) return; // an overlay consumed it
    const h = history.current;
    if (h.index > 0) setViewRaw(h.stack[--h.index]);
  }, []);
  const goForward = useCallback(() => {
    const h = history.current;
    if (h.index < h.stack.length - 1) setViewRaw(h.stack[++h.index]);
  }, []);

  useEffect(() => {
    // macOS reports the thumb buttons as mouse buttons 3 and 4.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("mouseup", onMouse);
    return () => window.removeEventListener("mouseup", onMouse);
  }, [goBack, goForward]);

  // Opening a tab from anywhere lands back in the terminal.
  useEffect(() => onOpenTerminalTab(() => setView("terminal")), [setView]);

  const openPreview = useCallback((sessionId: string, query: string) => {
    setPreview({ sessionId, query });
    setView("search");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      if (searchOpen) return; // the overlay handles its own keys
      if (meta && e.key === "1") setView("terminal");
      else if (meta && e.key === "2") setView("board");
      else if (meta && e.key === "3") setView("agents");
      else if (meta && e.key === "t") {
        e.preventDefault();
        setView("terminal");
        void newTab();
      } else if (meta && e.key === "w" && view === "terminal" && activeId) {
        e.preventDefault();
        closeTab(activeId);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, view, activeId, newTab, closeTab]);

  return (
    <div className="flex h-full flex-col">
      <Titlebar onSearch={() => setSearchOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onView={setView} />
        <main className="flex min-w-0 flex-1 flex-col">
          <TerminalView visible={view === "terminal"} />
          {view === "search" && (
            <div className="min-h-0 flex-1">
              <SearchView
                initialQuery={preview?.query}
                initialSessionId={preview?.sessionId}
              />
            </div>
          )}
          {view === "agents" && <AgentsView />}
          {view === "board" && <BoardView />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} onPreview={openPreview} />
      )}
    </div>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<DeckSettings>();
  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
  }, []);
  if (!settings) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 border-b border-edge px-6 py-3.5">
        <span className="font-bold text-ink">Settings</span>
      </div>
      <div className="w-[420px] px-6 py-5">
        <label className="block text-xs text-dim">Summon hotkey (Electron accelerator)</label>
        <input
          className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          defaultValue={settings.summonHotkey}
          onBlur={async (e) => {
            const v = e.target.value.trim();
            if (v && v !== settings.summonHotkey) {
              setSettings(await window.deck.updateSettings({ summonHotkey: v }));
            }
          }}
        />

        <label className="mt-4 block text-xs text-dim">New terminals start in</label>
        <input
          placeholder="~"
          className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          defaultValue={settings.defaultCwd}
          onBlur={async (e) => {
            const v = e.target.value.trim() || "~";
            if (v !== settings.defaultCwd) {
              setSettings(await window.deck.updateSettings({ defaultCwd: v }));
            }
          }}
        />

        <label className="mt-4 block text-xs text-dim">
          GitHub owner — scopes PR search (empty = all of GitHub)
        </label>
        <input
          placeholder="your-org"
          className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          defaultValue={settings.github.owner}
          onBlur={async (e) => {
            const v = e.target.value.trim();
            if (v !== settings.github.owner) {
              setSettings(await window.deck.updateSettings({ github: { owner: v } }));
            }
          }}
        />

        <div className="mt-6 border-t border-edge pt-4 text-xs font-bold text-ink">Jira</div>
        {(
          [
            ["baseUrl", "Base URL", "https://yourorg.atlassian.net"],
            ["email", "Email", "you@example.com"],
            ["apiToken", "API token", ""],
            ["boardId", "Board id", "25"],
            ["rejectedPattern", "Rejected status pattern", "reject"],
          ] as const satisfies readonly (readonly [
            "baseUrl" | "email" | "apiToken" | "boardId" | "rejectedPattern",
            string,
            string,
          ])[]
        ).map(([field, label, placeholder]) => (
          <div key={field}>
            <label className="mt-3 block text-xs text-dim">{label}</label>
            <input
              type={field === "apiToken" ? "password" : "text"}
              placeholder={placeholder}
              className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              defaultValue={settings.jira[field]}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (v !== settings.jira[field]) {
                  setSettings(
                    await window.deck.updateSettings({
                      jira: { ...settings.jira, [field]: v },
                    }),
                  );
                }
              }}
            />
          </div>
        ))}

        <label className="mt-3 block text-xs text-dim">Done column window (days)</label>
        <input
          type="number"
          min={1}
          className="mt-1 w-24 rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          defaultValue={settings.jira.doneWindowDays}
          onBlur={async (e) => {
            const v = Math.max(1, Number(e.target.value) || 7);
            if (v !== settings.jira.doneWindowDays) {
              setSettings(
                await window.deck.updateSettings({
                  jira: { ...settings.jira, doneWindowDays: v },
                }),
              );
            }
          }}
        />

        <label className="mt-4 block text-xs text-dim">
          Repo roots — searched by ⌘K and the repos fallback (one per line)
        </label>
        <textarea
          rows={3}
          placeholder="~/www"
          className="mt-1 w-full resize-none rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          defaultValue={settings.repoRoots.join("\n")}
          onBlur={async (e) => {
            const roots = e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            if (roots.join("\n") !== settings.repoRoots.join("\n")) {
              setSettings(await window.deck.updateSettings({ repoRoots: roots }));
            }
          }}
        />
      </div>
    </div>
  );
}
