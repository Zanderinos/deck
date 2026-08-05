import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SERVER_PORT } from "./server.js";

// Merges deck's session-tracking hooks into ~/.claude/settings.json, so every
// Claude Code session on the machine reports lifecycle events to deck. The
// curl times out fast and swallows failure: a dead deck never blocks Claude.

const EVENTS = ["SessionStart", "UserPromptSubmit", "Notification", "Stop", "SessionEnd"];

const MARKER = "/api/hook' -H 'x-deck-term:";

function hookCommand(): string {
  return `curl -s -m 3 -X POST 'http://127.0.0.1:${SERVER_PORT}/api/hook' -H 'x-deck-term: '"$DECK_TERM_ID" -H 'Content-Type: application/json' --data-binary @- >/dev/null || true`;
}

interface HookGroup {
  matcher?: string;
  hooks: { type: string; command: string }[];
}

export function installClaudeHooks(): { installed: boolean; path: string } {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const settings = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>)
    : {};

  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  let changed = false;
  for (const event of EVENTS) {
    const groups = hooks[event] ?? [];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.includes(MARKER)));
    if (!already) {
      groups.push({ hooks: [{ type: "command", command: hookCommand() }] });
      hooks[event] = groups;
      changed = true;
    }
  }

  if (changed) {
    settings.hooks = hooks;
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { installed: changed, path: settingsPath };
}

export function hooksInstalled(): boolean {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return false;
  return fs.readFileSync(settingsPath, "utf8").includes(MARKER);
}
