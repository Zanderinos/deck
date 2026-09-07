import type { AgentLaunch } from "./agents.js";
import type { DeckTheme } from "./themes.js";

export type PluginAction =
  | ({ type: "terminal"; cwd?: string; command?: string } & AgentLaunch)
  | { type: "panel"; title: string; markdown: string }
  | { type: "theme"; theme: string }
  | { type: "notify"; message: string };
export interface PluginCommand { id: string; title: string; description?: string; action?: PluginAction }
export interface DeckPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  path: string;
  enabled: boolean;
  commands: PluginCommand[];
  themes: DeckTheme[];
  source?: string;
  error?: string;
}
export interface ExtensionCatalog { themes: DeckTheme[]; plugins: DeckPlugin[]; errors: string[]; themesDirectory: string; pluginsDirectory: string }
export interface PluginContext { cwd?: string; agent?: "claude" | "codex"; sessionTitle?: string; theme: string }

export function parsePluginAction(value: unknown): PluginAction {
  if (!value || typeof value !== "object") throw new Error("Plugin action must be an object.");
  const action = value as Record<string, unknown>;
  if (action.type === "terminal") {
    if (action.agent !== undefined && action.agent !== "claude" && action.agent !== "codex") throw new Error("Unknown agent.");
    for (const key of ["cwd", "command", "prompt", "sessionId"]) if (action[key] !== undefined && typeof action[key] !== "string") throw new Error(`Invalid action ${key}.`);
    return { type: "terminal", cwd: action.cwd as string | undefined, command: action.command as string | undefined,
      agent: action.agent as AgentLaunch["agent"], prompt: action.prompt as string | undefined, sessionId: action.sessionId as string | undefined };
  }
  if (action.type === "panel" && typeof action.title === "string" && typeof action.markdown === "string" && action.markdown.length <= 200_000) return { type: "panel", title: action.title.slice(0, 120), markdown: action.markdown };
  if (action.type === "theme" && typeof action.theme === "string") return { type: "theme", theme: action.theme };
  if (action.type === "notify" && typeof action.message === "string") return { type: "notify", message: action.message.slice(0, 2000) };
  throw new Error("Unsupported plugin action.");
}
export function parsePluginCommand(value: unknown): PluginCommand {
  if (!value || typeof value !== "object") throw new Error("Plugin command must be an object.");
  const command = value as Record<string, unknown>;
  if (typeof command.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(command.id) || typeof command.title !== "string" || !command.title.trim()) throw new Error("Plugin commands need a valid id and title.");
  return { id: command.id, title: command.title.slice(0, 100), description: typeof command.description === "string" ? command.description.slice(0, 300) : undefined, action: command.action === undefined ? undefined : parsePluginAction(command.action) };
}
