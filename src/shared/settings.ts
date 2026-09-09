import type { Agent } from "./agents.js";
import type { TerminalAppearanceSettings } from "./terminal.js";

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
  /** Board columns whose issues count as reviewable: a review request only
   *  reaches the queue when its PR belongs to a card in one of these. Empty
   *  keeps every review request. */
  reviewColumns: string[];
  /** What happens to an issue when one of its PRs is merged from deck. */
  onMerge: OnMergeSettings;
}

/** - "local": the card shows in the target column on deck's board only, until
 *    Jira catches up (its own automation) or the issue moves elsewhere.
 *  - "jira": deck fires the Jira transition itself. */
export type OnMergeMode = "local" | "jira";

export interface OnMergeSettings {
  enabled: boolean;
  /** Board column the issue lands in. */
  column: string;
  mode: OnMergeMode;
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

/** What an agent does with a fix it prepared for one of the user's PRs.
 *  - "review": pauses with the diff for the user to approve the push.
 *  - "push": commits and pushes unattended. */
export type AutoFixPush = "review" | "push";

export interface AutoFixSettings {
  enabled: boolean;
  /** Start an agent when CI fails on one of the user's open PRs. */
  ci: boolean;
  /** Start an agent when one of the user's open PRs gets merge conflicts. */
  conflicts: boolean;
  push: AutoFixPush;
}

/** Where a new terminal starts.
 *  - "current": the active terminal's folder, falling back to `defaultCwd`.
 *  - "default": always `defaultCwd`. */
export type StartCwd = "current" | "default";

export interface NewTerminalCwdSettings {
  tab: StartCwd;
  split: StartCwd;
}

/** The page deck opens on. */
export type DefaultView = "terminal" | "board" | "agent" | "reviews";

/** Models the orchestrator can run on: aliases claude accepts plus the full id where no alias exists. */
export const askModels = [
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
  { id: "haiku", label: "Haiku" },
] as const;

export interface DeckSettings {
  defaultAgent: Agent;
  /** Claude model alias or id used by deck's own orchestrator turns. */
  askModel: string;
  defaultView: DefaultView;
  autoFix: AutoFixSettings;
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
  /** Hide a hotkey-summoned quake panel as soon as another app takes focus. */
  summonHideOnBlur: boolean;
  /** Keep Deck out of the Dock and Cmd-Tab; it lives in the tray and the hotkey. */
  hideFromDock: boolean;
  /** Directories deck treats as repo roots (search fallbacks, repo pickers). */
  repoRoots: string[];
  /** Folder new terminals fall back to. Supports ~. */
  defaultCwd: string;
  newTerminalCwd: NewTerminalCwdSettings;
  /** Built-in id, custom:<id>, or <plugin-id>:<theme-id>. */
  theme: string;
  terminalAppearance: TerminalAppearanceSettings;
}

export const defaultSettings: DeckSettings = {
  defaultAgent: "claude",
  askModel: "sonnet",
  defaultView: "terminal",
  autoFix: { enabled: false, ci: true, conflicts: true, push: "review" },
  jira: {
    baseUrl: "",
    email: "",
    apiToken: "",
    boardId: "",
    rejectedPattern: "reject",
    doneWindowDays: 7,
    reviewColumns: [],
    onMerge: { enabled: false, column: "", mode: "local" },
  },
  github: { owner: "" },
  windowMode: "shared",
  summonHotkey: "Alt+Space",
  summonHotkeyEnabled: true,
  summonDockToTop: true,
  summonHeightRatio: 0.6,
  summonHideOnBlur: true,
  hideFromDock: false,
  repoRoots: [],
  defaultCwd: "~",
  newTerminalCwd: { tab: "current", split: "current" },
  theme: "dark",
  terminalAppearance: {
    fontFamily: "",
    fontSize: 13,
    fontWeight: "normal",
    fontWeightBold: "bold",
    lineHeight: 1,
    cursorBlink: true,
    cursorStyle: "block",
  },
};
