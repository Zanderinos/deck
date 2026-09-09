import { defaultSettings, type DeckSettings } from "../shared/settings.js";
import { kvGet, kvSet } from "./db.js";

const KEY = "settings";

export function getSettings(): DeckSettings {
  const stored = kvGet<Partial<DeckSettings>>(KEY) ?? {};
  // Nested groups gain fields over time; settings saved before a field
  // existed must still pick up its default.
  return {
    ...defaultSettings,
    ...stored,
    jira: { ...defaultSettings.jira, ...stored.jira },
    github: { ...defaultSettings.github, ...stored.github },
    autoFix: { ...defaultSettings.autoFix, ...stored.autoFix },
    terminalAppearance: { ...defaultSettings.terminalAppearance, ...stored.terminalAppearance },
  };
}

export function updateSettings(patch: Partial<DeckSettings>): DeckSettings {
  const next = { ...getSettings(), ...patch };
  kvSet(KEY, next);
  return next;
}
