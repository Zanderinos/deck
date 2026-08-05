import { defaultSettings, type DeckSettings } from "../shared/settings.js";
import { kvGet, kvSet } from "./db.js";

const KEY = "settings";

export function getSettings(): DeckSettings {
  return { ...defaultSettings, ...(kvGet<Partial<DeckSettings>>(KEY) ?? {}) };
}

export function updateSettings(patch: Partial<DeckSettings>): DeckSettings {
  const next = { ...getSettings(), ...patch };
  kvSet(KEY, next);
  return next;
}
