import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DeckSettings } from "../../../shared/settings.js";

// One ipc subscription for the whole renderer. Subscribing per component
// trips Electron's MaxListenersExceededWarning once a handful of panes are open.
const Context = createContext<{ settings?: DeckSettings } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DeckSettings>();
  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
    return window.deck.onSettingsChanged(setSettings);
  }, []);
  return <Context.Provider value={{ settings }}>{children}</Context.Provider>;
}

/** Reads Deck's settings, and re-renders when they change. */
export function useSettings(): DeckSettings | undefined {
  const context = useContext(Context);
  if (!context) throw new Error("useSettings needs a SettingsProvider");
  return context.settings;
}
