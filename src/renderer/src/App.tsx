import { ExtensionProvider } from "./extensions/ExtensionProvider.js";
import { AppearanceSettings, PluginsSettings } from "./extensions/AppearanceSettings.js";
import { DisplayModeProvider, FocusModeBar, useDisplayMode } from "./chrome/DisplayMode.js";
import { AgentSelect } from "./agents/AgentSelect.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckSettings, OnMergeMode, OnMergeSettings } from "../../shared/settings.js";
import { AgentPage } from "./agents/AgentPage.js";
import { BoardView } from "./board/BoardView.js";
import { ReviewsView } from "./board/ReviewsView.js";
import { Sidebar } from "./chrome/Sidebar.js";
import { Titlebar } from "./chrome/Titlebar.js";
import { onOpenTerminalTab, requestNavBack } from "./lib/bus.js";
import { SearchOverlay } from "./search/SearchOverlay.js";
import { SearchView } from "./search/SearchView.js";
import { TabProvider, useTabs } from "./store.js";
import { TerminalView } from "./terminal/TerminalView.js";

export type View = "terminal" | "board" | "agent" | "reviews" | "search" | "settings";

export default function App() {
  return (
    <DisplayModeProvider>
      <TabProvider>
        <ExtensionProvider><Shell /></ExtensionProvider>
      </TabProvider>
    </DisplayModeProvider>
  );
}

function Shell() {
  const { mode, setMode, presentationSize } = useDisplayMode();
  const [view, setViewRaw] = useState<View>("terminal");
  // The configured start page applies once, unless the user already moved on.
  useEffect(() => {
    void window.deck.getSettings().then(({ defaultView }) => {
      if (history.current.stack.length === 1) { setViewRaw(defaultView); history.current.stack = [defaultView]; }
    });
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("deck.sidebar") !== "hidden");
  const [searchOpen, setSearchOpen] = useState(false);
  const [preview, setPreview] = useState<{ sessionId: string; query: string }>();
  const { tabs, focusTab, newTab, closeTab, activeId } = useTabs();

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
  // Zen and Presentation go fullscreen like WebStorm's; leaving restores
  // whatever the window was before.
  const wasFullScreen = useRef(false);
  useEffect(() => {
    if (mode === "normal") { if (!wasFullScreen.current) void window.deck.window.setFullScreen(false); return; }
    void window.deck.window.isFullScreen().then((on) => { wasFullScreen.current = on; if (!on) void window.deck.window.setFullScreen(true); });
  }, [mode]);
  useEffect(() => {
    const onModeKey = (event: KeyboardEvent) => {
      if (searchOpen) return;
      // Other pages use Escape themselves (closing composers and menus).
      if (event.key === "Escape" && mode !== "normal" && view === "terminal") {
        event.preventDefault(); event.stopImmediatePropagation(); setMode("normal");
      } else if (event.metaKey && event.shiftKey && event.key === "Enter") {
        event.preventDefault(); event.stopImmediatePropagation(); setMode(mode === "zen" ? "normal" : "zen");
      } else if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault(); event.stopImmediatePropagation(); setMode(mode === "presentation" ? "normal" : "presentation");
      }
    };
    window.addEventListener("keydown", onModeKey, true);
    return () => window.removeEventListener("keydown", onModeKey, true);
  }, [mode, setMode, searchOpen, view]);

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
      if (meta && ["k", "p"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      if (searchOpen) return; // the overlay handles its own keys
      if (e.metaKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const tab = tabs[Number(e.key) - 1];
        if (tab) { focusTab(tab.termId); setView("terminal"); }
      } else if (meta && e.key.toLowerCase() === "b") {
        setSidebarOpen((open) => { localStorage.setItem("deck.sidebar", open ? "hidden" : "visible"); return !open; });
      } else if (meta && e.key === ",") setView("settings");
      else if (meta && e.shiftKey && e.key === "1") setView("terminal");
      else if (meta && e.shiftKey && e.key === "2") setView("board");
      else if (meta && e.shiftKey && e.key === "3") setView("agent");
      else if (meta && e.shiftKey && e.key === "4") setView("reviews");
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
  }, [searchOpen, view, activeId, newTab, closeTab, tabs, focusTab]);

  return (
    <div className={`flex h-full flex-col ${mode !== "normal" ? "focus-mode" : ""}`} data-display-mode={mode}>
      <FocusModeBar view={view} />
      <div className="workbench-chrome"><Titlebar onSearch={() => setSearchOpen(true)} sidebarOpen={sidebarOpen} onView={setView} onSidebar={() => setSidebarOpen((open) => { localStorage.setItem("deck.sidebar", open ? "hidden" : "visible"); return !open; })} /></div>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <div className="workbench-chrome flex min-h-0"><Sidebar view={view} onView={setView} /></div>}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TerminalView visible={view === "terminal"} />
          {/* The terminal scales its own font; every other page zooms by the same ratio. */}
          <div className={`${view === "terminal" ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col`} style={{ zoom: mode === "presentation" ? presentationSize / 13 : 1 }}>
          {view === "search" && (
            <div className="min-h-0 flex-1">
              <SearchView
                initialQuery={preview?.query}
                initialSessionId={preview?.sessionId}
              />
            </div>
          )}
          <AgentPage visible={view === "agent"} />
          <ReviewsView visible={view === "reviews"} />
          {view === "board" && <BoardView />}
          {view === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} onPreview={openPreview} onView={setView} />
      )}
    </div>
  );
}

function SettingsView() {
  const [section, setSection] = useState<"appearance" | "plugins" | "general">("appearance");
  const [settings, setSettings] = useState<DeckSettings>();
  const [columns, setColumns] = useState<string[]>([]);
  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
    void window.deck.board.get().then((b) => setColumns(b?.columns.map((c) => c.name) ?? []));
  }, []);
  if (!settings) return null;
  const { onMerge } = settings.jira;
  const updateOnMerge = async (patch: Partial<OnMergeSettings>) =>
    setSettings(
      await window.deck.updateSettings({
        jira: { ...settings.jira, onMerge: { ...onMerge, ...patch } },
      }),
    );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 border-b border-edge px-6 py-3.5">
        <span className="font-bold text-ink">Settings</span>
        <div className="ml-4 flex gap-1 font-sans text-xs">{(["appearance", "plugins", "general"] as const).map((tab) => <button key={tab} onClick={() => setSection(tab)} className={`rounded-md px-3 py-1.5 ${section === tab ? "bg-card2 text-soft" : "text-mut hover:text-soft"}`}>{tab === "appearance" ? "Appearance" : tab === "plugins" ? "Plugins" : "General & integrations"}</button>)}</div>
      </div>
      {section === "appearance" && <AppearanceSettings />}
      {section === "plugins" && <PluginsSettings />}
      <div className={`${section === "general" ? "" : "hidden"} min-h-0 w-[420px] flex-1 overflow-y-auto px-6 py-5`}>
        <div className="mb-4 flex items-center justify-between text-xs text-dim">
          <span>Default agent</span>
          <AgentSelect value={settings.defaultAgent} onChange={async (defaultAgent) => {
            setSettings(await window.deck.updateSettings({ defaultAgent }));
          }} />
        </div>
        <div className="mb-4 flex items-center justify-between text-xs text-dim">
          <span>Start page</span>
          <select aria-label="Start page" className="rounded-md border border-edge2 bg-card px-2 py-1 text-[11px] text-body outline-none" value={settings.defaultView}
            onChange={async (e) => setSettings(await window.deck.updateSettings({ defaultView: e.target.value as DeckSettings["defaultView"] }))}>
            <option value="terminal">Terminal</option><option value="agent">Agent</option><option value="reviews">Reviews</option><option value="board">Board</option>
          </select>
        </div>
        <div className="mb-1 text-xs font-bold text-ink">Auto-fix my pull requests</div>
        {([["enabled", "Start an agent automatically when one of my PRs breaks"], ["ci", "…when CI fails"], ["conflicts", "…when it gets merge conflicts"]] as const).map(([field, text]) => (
          <label key={field} className="mt-2 flex items-center gap-2 text-xs text-dim">
            <input type="checkbox" checked={settings.autoFix[field]} disabled={field !== "enabled" && !settings.autoFix.enabled}
              onChange={async (e) => setSettings(await window.deck.updateSettings({ autoFix: { ...settings.autoFix, [field]: e.target.checked } }))} />
            {text}
          </label>
        ))}
        <label className="mt-2 block text-xs text-dim">When the fix is ready</label>
        <select className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" value={settings.autoFix.push}
          onChange={async (e) => setSettings(await window.deck.updateSettings({ autoFix: { ...settings.autoFix, push: e.target.value as DeckSettings["autoFix"]["push"] } }))}>
          <option value="review">Show me the diff and wait for my approval before pushing</option>
          <option value="push">Commit and push without asking</option>
        </select>

        <label className="mt-4 block text-xs text-dim">Windows</label>
        <select
          className="mt-1 w-full rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          value={settings.windowMode}
          onChange={async (e) => {
            const v = e.target.value as DeckSettings["windowMode"];
            if (v !== settings.windowMode) {
              setSettings(await window.deck.updateSettings({ windowMode: v }));
            }
          }}
        >
          <option value="shared">One shared window for hotkey, tray and manual open</option>
          <option value="panel">Separate hotkey panel + main window for tray/manual</option>
          <option value="per-entry">Separate windows for hotkey, tray and manual open</option>
        </select>

        <label className="mt-4 flex items-center gap-2 text-xs text-dim">
          <input
            type="checkbox"
            checked={settings.summonHotkeyEnabled}
            onChange={async (e) =>
              setSettings(
                await window.deck.updateSettings({ summonHotkeyEnabled: e.target.checked }),
              )
            }
          />
          Enable summon hotkey
        </label>

        <label className="mt-2 flex items-center gap-2 text-xs text-dim">
          <input
            type="checkbox"
            checked={settings.summonDockToTop}
            onChange={async (e) =>
              setSettings(
                await window.deck.updateSettings({ summonDockToTop: e.target.checked }),
              )
            }
          />
          Hotkey docks the window to the top of the screen (quake style)
        </label>

        <label className="mt-4 block text-xs text-dim">Summon hotkey (Electron accelerator)</label>
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

        <label className="mt-4 flex items-center gap-2 text-xs text-dim">
          <input
            type="checkbox"
            checked={onMerge.enabled}
            onChange={(e) => void updateOnMerge({ enabled: e.target.checked })}
          />
          Move the issue when its PR is merged from deck
        </label>
        {onMerge.enabled && (
          <div className="mt-2 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={onMerge.column}
              onChange={(e) => void updateOnMerge({ column: e.target.value })}
            >
              <option value="">{columns.length ? "Pick a column…" : "Sync the board first"}</option>
              {columns.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className="min-w-0 flex-1 rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={onMerge.mode}
              onChange={(e) => void updateOnMerge({ mode: e.target.value as OnMergeMode })}
            >
              <option value="local">On deck's board only (until Jira catches up)</option>
              <option value="jira">Transition in Jira too</option>
            </select>
          </div>
        )}

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
