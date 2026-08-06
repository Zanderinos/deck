import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SERVER_PORT } from "./server.js";

// Merges deck's session-tracking hooks into ~/.claude/settings.json, so every
// Claude Code session on the machine reports lifecycle events to deck. The
// curl times out fast and swallows failure: a dead deck never blocks Claude.

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "PostToolUse",
  "Stop",
  "SessionEnd",
];

const MARKER = "/api/hook' -H 'x-deck-term:";

function hookCommand(): string {
  return `curl -s -m 3 -X POST 'http://127.0.0.1:${SERVER_PORT}/api/hook' -H 'x-deck-term: '"$DECK_TERM_ID" -H 'Content-Type: application/json' --data-binary @- >/dev/null || true`;
}

interface HookGroup {
  matcher?: string;
  hooks: { type: string; command: string }[];
}

// A model-invoked skill: Claude triggers it whenever it pauses to ask the
// user to verify changes before committing/pushing, and it reports the
// decision summary to deck so the tab flips to "needs review".
const SKILL = `---
name: deck-review
description: Use whenever you pause to ask the user to review or verify changes before committing, pushing, or opening a PR. Marks the deck terminal tab as "needs review" and shows your decision summary next to the diff. Only works inside a deck terminal ($DECK_TERM_ID set).
---

You are about to ask the user to verify your changes. Before writing that
message:

1. Compose a short markdown summary of the decisions and choices you made —
   highlight questionable ones: assumptions, trade-offs, anything with a
   reasonable alternative approach.
2. Write the summary to a temp file and send it to deck:

   \`\`\`bash
   cat > /tmp/deck-review-note.md <<'NOTE'
   <your summary>
   NOTE
   curl -s -m 3 -X POST 'http://127.0.0.1:${SERVER_PORT}/api/review' -H "x-deck-term: $DECK_TERM_ID" --data-binary @/tmp/deck-review-note.md >/dev/null || true
   \`\`\`

   Skip this silently if $DECK_TERM_ID is empty.
3. Then present the same summary to the user and ask for verification. Do
   not commit, push, or open the PR until the user explicitly confirms.
`;

function installReviewSkill(): void {
  const dir = path.join(os.homedir(), ".claude", "skills", "deck-review");
  const file = path.join(dir, "SKILL.md");
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === SKILL) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, SKILL);
}

export function installClaudeHooks(): { installed: boolean; path: string } {
  installReviewSkill();
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
