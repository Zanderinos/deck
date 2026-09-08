import { useEffect, useState } from "react";
import type { DeckSettings } from "../../../shared/settings.js";

/** Reads Deck's settings, and re-reads them when they change. */
export function useSettings(): DeckSettings | undefined {
  const [settings, setSettings] = useState<DeckSettings>();
  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
    return window.deck.onSettingsChanged(setSettings);
  }, []);
  return settings;
}
