import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TipAdvisor, type Tip, type TipEvent } from "../../../shared/tips.js";
import { useSettings } from "../lib/useSettings.js";

// Components report what the user did; the provider decides whether that
// earns a tip, shows each tip once and remembers it across restarts.

const SEEN_KEY = "deck.tips.seen";
const SHOW_MS = 12_000;

function seenTips(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

interface TipsStore {
  report: (event: TipEvent) => void;
}

const Ctx = createContext<TipsStore | null>(null);

export function TipsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const advisor = useRef(new TipAdvisor());
  const [tip, setTip] = useState<Tip>();
  const enabled = settings?.showTips ?? true;
  const defaultAgent = settings?.defaultAgent ?? "claude";

  const report = useCallback((event: TipEvent) => {
    const tip = advisor.current.advise(event, { defaultAgent });
    if (!tip || !enabled) return;
    const seen = seenTips();
    if (seen.has(tip.id)) return;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, tip.id]));
    setTip(tip);
  }, [enabled, defaultAgent]);

  useEffect(() => {
    if (!tip) return;
    const timer = setTimeout(() => setTip(undefined), SHOW_MS);
    return () => clearTimeout(timer);
  }, [tip]);

  const store = useMemo<TipsStore>(() => ({ report }), [report]);
  return <Ctx.Provider value={store}>
    {children}
    {tip && enabled && <div role="status" className="absolute bottom-12 right-4 z-30 flex max-w-sm items-center gap-3 rounded-md border border-edge3 bg-overlay px-3 py-2 font-sans text-[11px] text-soft shadow-lg">
      <span aria-hidden>💡</span>
      <span>{tip.message}</span>
      <button onClick={() => setTip(undefined)} className="shrink-0 text-dim hover:text-soft">Got it</button>
    </div>}
  </Ctx.Provider>;
}

export function useTips(): TipsStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTips outside TipsProvider");
  return store;
}
