import { useAgentSessions } from "../lib/useSessions.js";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../board/icons.js";
import { useTabs } from "../store.js";

export type DisplayMode = "normal" | "zen" | "presentation";
interface DisplaySettings {
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
  presentationSize: number;
  setPresentationSize: (size: number) => void;
}
const Context = createContext<DisplaySettings | null>(null);

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DisplayMode>("normal");
  const [presentationSize, setPresentationSize] = useState(20);
  const settings = useMemo(() => ({ mode, setMode, presentationSize, setPresentationSize }), [mode, presentationSize]);
  return <Context.Provider value={settings}>{children}</Context.Provider>;
}
export function useDisplayMode(): DisplaySettings {
  const settings = useContext(Context);
  if (!settings) throw new Error("useDisplayMode outside DisplayModeProvider");
  return settings;
}

export function FocusModeBar() {
  const { mode, setMode, presentationSize, setPresentationSize } = useDisplayMode();
  const { tabs, activeId, focusTab } = useTabs();
  const sessions = useAgentSessions();
  const session = sessions.find((session) => session.term_id === activeId && session.status !== "ended");
  const index = tabs.findIndex((tab) => tab.termId === activeId);
  const active = tabs[index];
  const move = (direction: number) => {
    if (!tabs.length) return;
    focusTab(tabs[(Math.max(0, index) + direction + tabs.length) % tabs.length].termId);
  };
  if (mode === "normal") return null;
  return <div className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-edge/50 bg-bg pl-[100px] pr-4 font-sans text-[11px] text-mut">
    <span className="text-soft">{mode === "zen" ? "Zen" : "Presentation"}</span>
    <span className="min-w-0 flex-1 truncate text-dim">{active?.customTitle || session?.title || active?.title || "Terminal"}</span>
    {mode === "presentation" && <>
      <button aria-label="Smaller presentation text" title="Smaller text" disabled={presentationSize <= 16} onClick={() => setPresentationSize(presentationSize - 2)} className="rounded px-1.5 py-1 hover:bg-card disabled:opacity-30">A−</button>
      <span className="text-dim">{presentationSize}px</span>
      <button aria-label="Larger presentation text" title="Larger text" disabled={presentationSize >= 32} onClick={() => setPresentationSize(presentationSize + 2)} className="rounded px-1.5 py-1 hover:bg-card disabled:opacity-30">A+</button>
      <span className="mx-1 h-3 border-l border-edge3" />
      <button aria-label="Previous presentation session" disabled={tabs.length < 2} onClick={() => move(-1)} className="px-2 py-1 hover:text-soft disabled:opacity-30">←</button>
      <span>{Math.max(0, index) + (tabs.length ? 1 : 0)} / {tabs.length}</span>
      <button aria-label="Next presentation session" disabled={tabs.length < 2} onClick={() => move(1)} className="px-2 py-1 hover:text-soft disabled:opacity-30">→</button>
    </>}
    <button onClick={() => setMode("normal")} aria-label={`Exit ${mode} view`} className="flex items-center gap-1.5 rounded border border-edge2 px-2 py-1 text-body hover:border-edge3 hover:text-ink"><Icon name="x" size={10} />Exit <kbd className="ml-1 text-[9px] text-dim">esc</kbd></button>
  </div>;
}
