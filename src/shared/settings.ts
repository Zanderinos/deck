// Settings shape shared between main and renderer. Everything user-tunable
// lives here — deck ships no hardcoded personal or company config.

export interface DeckSettings {
  /** Electron accelerator that summons/hides the window from anywhere. */
  summonHotkey: string;
  /** Directories deck treats as repo roots (search fallbacks, repo pickers). */
  repoRoots: string[];
  /** Theme is dark-only for now; kept as a setting so light mode can land later. */
  theme: "dark";
}

export const defaultSettings: DeckSettings = {
  summonHotkey: "Alt+Space",
  repoRoots: [],
  theme: "dark",
};
