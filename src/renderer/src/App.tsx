import { useEffect, useState } from "react";
import type { DeckSettings } from "../../shared/settings.js";
import { TerminalTabs } from "./terminal/TerminalTabs.js";

type View = "terminal" | "search" | "board" | "settings";

const nav: { id: View; label: string; glyph: string }[] = [
  { id: "terminal", label: "Terminal", glyph: ">" },
  { id: "search", label: "Search", glyph: "?" },
  { id: "board", label: "Board", glyph: "#" },
  { id: "settings", label: "Settings", glyph: "*" },
];

export default function App() {
  const [view, setView] = useState<View>("terminal");
  const [settings, setSettings] = useState<DeckSettings>();

  useEffect(() => {
    window.deck.getSettings().then(setSettings);
  }, []);

  return (
    <div className="flex h-full">
      <aside className="flex w-13 flex-col items-center gap-1 border-r border-edge bg-panel pt-10 drag-region">
        {nav.map((n) => (
          <button
            key={n.id}
            title={n.label}
            onClick={() => setView(n.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-md font-mono text-sm transition-colors ${
              view === n.id ? "bg-edge text-ink" : "text-dim hover:text-ink"
            }`}
          >
            {n.glyph}
          </button>
        ))}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Terminals stay mounted across view switches so sessions survive. */}
        <div className={`min-h-0 flex-1 ${view === "terminal" ? "" : "hidden"}`}>
          <TerminalTabs />
        </div>
        {view !== "terminal" && (
          <>
            <header className="h-10 shrink-0 border-b border-edge drag-region" />
            <section className="flex flex-1 items-center justify-center">
              {view === "settings" ? (
                <SettingsView settings={settings} onChange={setSettings} />
              ) : (
                <div className="text-center">
                  <div className="font-mono text-2xl text-dim">deck</div>
                  <div className="mt-2 text-sm text-dim">
                    {settings
                      ? `press ${prettyHotkey(settings.summonHotkey)} anywhere to summon`
                      : ""}
                  </div>
                  <div className="mt-1 text-xs text-dim/60">{viewHint(view)}</div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function viewHint(view: View): string {
  switch (view) {
    case "search":
      return "global conversation search lands soon";
    case "board":
      return "the board port lands soon";
    default:
      return "";
  }
}

function prettyHotkey(accelerator: string): string {
  return accelerator.replace("Alt", "⌥").replace("Cmd", "⌘").replace("+", "");
}

function SettingsView({
  settings,
  onChange,
}: {
  settings?: DeckSettings;
  onChange: (s: DeckSettings) => void;
}) {
  if (!settings) return null;
  return (
    <div className="w-96">
      <h1 className="mb-4 text-sm font-medium">Settings</h1>
      <label className="block text-xs text-dim">Summon hotkey (Electron accelerator)</label>
      <input
        className="mt-1 w-full rounded-md border border-edge bg-panel px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
        defaultValue={settings.summonHotkey}
        onBlur={async (e) => {
          const v = e.target.value.trim();
          if (v && v !== settings.summonHotkey) {
            onChange(await window.deck.updateSettings({ summonHotkey: v }));
          }
        }}
      />
    </div>
  );
}
