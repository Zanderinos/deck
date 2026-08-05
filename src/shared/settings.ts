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

export interface DeckSettings {
  jira: JiraSettings;
  github: GithubSettings;
  /** Electron accelerator that summons/hides the window from anywhere. */
  summonHotkey: string;
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
  summonHotkey: "Alt+Space",
  summonHeightRatio: 0.6,
  repoRoots: [],
  defaultCwd: "~",
  theme: "dark",
};
