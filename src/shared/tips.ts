import { agentLabels, type Agent } from "./agents.js";

// Tips are one-off hints deck shows when it notices the user doing something
// the long way round: typing a command deck has a page or shortcut for, or
// reaching for the mouse where a key would do. Each tip has a stable id so
// the renderer shows it once and never again.

export interface Tip {
  id: string;
  message: string;
}

/** Mouse actions deck offers a shortcut for. */
export type TipAction = "new-tab-button" | "close-tab-button" | "tab-click" | "split-button" | "sidebar-button" | "settings-button";

/** Something the user just did that may earn a tip. */
export type TipEvent = { command: string } | { action: TipAction };

export interface TipContext {
  defaultAgent: Agent;
}

interface TipRule {
  id: string;
  message: string | ((context: TipContext) => string);
  /** Fires when a command typed into the shell matches. */
  command?: RegExp;
  /** Fires once the action has been taken this many times. */
  action?: { name: TipAction; times: number };
}

/** Order matters: the first matching rule wins, so specific commands precede general ones. */
export const tipRules: readonly TipRule[] = [
  { id: "resume-session", command: /^(?:claude\b.*--resume|codex\s+resume)\b/, message: "Sessions resume from the sidebar, or through ⌘K, which also finds them by what you asked." },
  { id: "agent-tab", command: /^(?:claude|codex)(?:\s|$)/, message: ({ defaultAgent }) => `Press ⌘⇧N to open a new ${agentLabels[defaultAgent]} tab straight away. The default agent lives in Settings.` },
  { id: "changes-panel", command: /^git\s+(?:status|diff)\b/, message: "⌘E opens the Changes panel, which follows the working tree live." },
  { id: "file-explorer", command: /^(?:ls|tree)(?:\s|$)/, message: "The File explorer in the footer browses this folder." },
  { id: "pr-pages", command: /^gh\s+pr\s+(?:view|checks|status)\b/, message: "The Board (⌘⌥2) and Reviews (⌘⌥4) pages follow your pull requests and their checks." },
  { id: "new-tab-key", action: { name: "new-tab-button", times: 3 }, message: "⌘T opens a new terminal." },
  { id: "close-tab-key", action: { name: "close-tab-button", times: 3 }, message: "⌘W closes the active terminal." },
  { id: "switch-tab-keys", action: { name: "tab-click", times: 5 }, message: "⌘1 to ⌘9 switch between the first nine tabs." },
  { id: "split-keys", action: { name: "split-button", times: 2 }, message: "⌘D splits right and ⌘⇧D splits down." },
  { id: "sidebar-key", action: { name: "sidebar-button", times: 2 }, message: "⌘B toggles the sidebar." },
  { id: "settings-key", action: { name: "settings-button", times: 2 }, message: "⌘, opens Settings." },
];

/** Turns what the user does into tips. Counts actions across its lifetime,
 *  so one advisor should live as long as the window. */
export class TipAdvisor {
  private readonly counts = new Map<TipAction, number>();

  constructor(private readonly rules: readonly TipRule[] = tipRules) {}

  advise(event: TipEvent, context: TipContext): Tip | undefined {
    if ("action" in event) this.counts.set(event.action, (this.counts.get(event.action) ?? 0) + 1);
    const rule = this.rules.find((rule) => "command" in event
      ? rule.command?.test(event.command)
      : rule.action?.name === event.action && rule.action.times === this.counts.get(event.action));
    if (!rule) return undefined;
    return { id: rule.id, message: typeof rule.message === "string" ? rule.message : rule.message(context) };
  }
}

export interface TypedInput {
  /** What the user has typed on the current line so far. */
  typed: string;
  /** The line the user just submitted with Enter, if this input ended one. */
  submitted?: string;
}

// Escape sequences (arrows, function keys) and bracketed-paste markers carry
// no typed text; only the wrapped paste content does.
const CONTROL_SEQUENCES = /\x1b(?:\[[0-9;?]*[A-Za-z~]|.)?/g;

/** Follows raw terminal input keystroke by keystroke to recover the line the
 *  user typed. A heuristic: recalled history and edits mid-line are not seen,
 *  which only means a tip is missed, never shown wrongly. */
export function trackTypedInput(typed: string, data: string): TypedInput {
  let line = typed;
  let submitted: string | undefined;
  for (const char of data.replace(CONTROL_SEQUENCES, "")) {
    if (char === "\r" || char === "\n") { submitted = line.trim(); line = ""; }
    else if (char === "\x7f" || char === "\b") line = line.slice(0, -1);
    else if (char === "\x03" || char === "\x15") line = "";
    else if (char >= " ") line += char;
  }
  return submitted === undefined ? { typed: line } : { typed: line, submitted };
}
