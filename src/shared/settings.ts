// Settings shape shared between main and renderer. Everything user-tunable
// lives here — deck ships no hardcoded personal or company config.

export interface JiraSettings {
  baseUrl: string;
  email: string;
  apiToken: string;
  boardId: string;
  /** Status names matching this (case-insensitive) get the rejected treatment. */
  rejectedPattern: string;
  /** How many days of Done issues stay on the board. */
  doneWindowDays: number;
}

export interface GithubSettings {
  /** Org/user that scopes PR search; empty searches all of GitHub. */
  owner: string;
}

/** How the entry points (hotkey, tray, manual open) map to windows.
 *  - "shared": one window for everything.
 *  - "panel": the hotkey gets its own quake panel; tray and manual share a main window.
 *  - "per-entry": hotkey, tray and manual open each get their own window. */
export type WindowMode = "shared" | "panel" | "per-entry";

export interface DeckSettings {
  jira: JiraSettings;
  github: GithubSettings;
  windowMode: WindowMode;
  /** Electron accelerator that summons/hides the window from anywhere. */
  summonHotkey: string;
  /** Master switch for the summon hotkey. */
  summonHotkeyEnabled: boolean;
  /** Whether the hotkey docks the window to the top of the screen (quake style). */
  summonDockToTop: boolean;
  /** Quake-style panel height as a fraction of the screen's work area. */
  summonHeightRatio: number;
  /** Directories deck treats as repo roots (search fallbacks, repo pickers). */
  repoRoots: string[];
  /** Where a new terminal tab starts. Supports ~. */
  defaultCwd: string;
  /** Theme is dark-only for now; kept as a setting so light mode can land later. */
  theme: "dark";
}

export const defaultSettings: DeckSettings = {
  jira: {
    baseUrl: "",
    email: "",
    apiToken: "",
    boardId: "",
    rejectedPattern: "reject",
    doneWindowDays: 7,
  },
  github: { owner: "" },
  windowMode: "shared",
  summonHotkey: "Alt+Space",
  summonHotkeyEnabled: true,
  summonDockToTop: true,
  summonHeightRatio: 0.6,
  repoRoots: [],
  defaultCwd: "~",
  theme: "dark",
};
