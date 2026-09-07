# Deck

An agent workbench and desktop terminal. Summon it with **⌥Space**.

- Claude Code and Codex sessions: launch, resume, live sidebar status, searchable local conversation history, and PR review agents.
- Compact vertical tabs with search, rename, attention filters, Git status, and keyboard navigation.
- Resizable nested terminal splits, terminal find/export, multiline input, and a local file explorer with text editing and Markdown previews.
- Zen view for the active terminal; Presentation view with larger adjustable text and session navigation.
- Five built-in themes, live custom JSON themes, and local plugins contributing themes, commands, agent prompts, and Markdown panels. See [the extension guide](docs/extensions.md) and [starter plugin](examples/plugins/workspace-kit).
- Jira board and GitHub pull request tools.

## Run

```sh
npm install
npm run dev
```

Install and authenticate `claude` and/or `codex` separately. Choose the default agent in **Settings → General**. New-session menus and PR review screens also let you choose either agent.

Use the sidebar's live-status controls to install hooks for each provider. For Codex, trust Deck's installed hooks in Codex's `/hooks` interface; Deck preserves existing hooks and does not bypass agent permissions. The hook server accepts local connections only. History is indexed from `~/.claude/projects`, plus `$CODEX_HOME/sessions` and `archived_sessions` (default `~/.codex`). Codex subagent transcripts and internal environment messages are excluded from conversation results.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘K | Search sessions, history, commands, themes and repositories |
| ⌘T | New terminal |
| ⌘W | Close active terminal |
| ⌘1–9 | Switch terminal |
| ⌘B | Toggle sidebar |
| ⌘D / ⌘⇧D | Split right / down |
| ⌘F | Find in terminal |
| ⌘J | Toggle multiline input |
| ⌘⇧Enter | Toggle Zen view |
| ⌘⇧P | Toggle Presentation view |
| Escape | Exit Zen / Presentation |

Presentation controls adjust text size and switch sessions. Exiting restores your split layout. Drag pane dividers to resize; arrow keys resize a focused divider and double-click resets it.

## Validate

```sh
npm run typecheck
npm test
npm run test:ui
npm run test:pty
```

Tests use Electron's Node runtime to match the native SQLite ABI. The UI smoke test opens an isolated Electron window with fixture sessions, exercises the interface, and writes screenshots to `artifacts/ui`. It does not launch paid agents or access your sessions. Run it in a desktop environment. The PTY smoke test uses a temporary local shell to check native input/output, replay, metadata, and termination.

Deck is evolving toward an everyday terminal replacement. This implements the local terminal UI and agent workflows described above; it does not include Warp's cloud collaboration or Pi's model/tool extension compatibility.

Electron + React + Tailwind + xterm.js + SQLite. MIT.
