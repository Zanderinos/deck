# Deck

An agent workbench and desktop terminal. Summon it with **⌥Space**.

- Claude Code and Codex sessions: launch, resume, live sidebar status, searchable local conversation history, and PR review agents.
- Compact vertical tabs with search, rename, attention filters, Git status, and keyboard navigation. One optional “Continue your last session” suggestion for activity within 15 minutes; dismiss all suggestions or close all tabs from the session menu. Older sessions remain searchable.
- Resizable nested terminal splits, terminal find/export, multiline input, and a local file explorer with text editing and Markdown previews.
- Zen and Presentation views on every page, WebStorm style: both go fullscreen and hide the chrome; Presentation enlarges the terminal font and zooms the other pages by the same ratio. Escape exits from the terminal; elsewhere use the Exit button or the same shortcut.
- Review threads collapse to one line like GitHub's; resolved and outdated threads start collapsed.
- Five built-in themes, live custom JSON themes, and local plugins contributing themes, commands, agent prompts, and Markdown panels. See [the extension guide](docs/extensions.md) and [starter plugin](examples/plugins/workspace-kit).
- Jira board and GitHub pull request tools, with the Jira board synced in the background.
- **Agent page** (⌘⇧3): Deck's orchestrator, front and centre like Linear's Agent view. Each question gets the live sessions, your PR inbox (PRs waiting on your review, your own PRs with CI/conflict/review problems) and the synced Jira board. Through Deck's own MCP tools it can start Claude or Codex agents in Deck terminals, answer or steer running ones, read their transcripts, put an agent on a broken PR, search the Jira backlog and create issues (only after you agree). Example prompts cover PRs to review, PRs needing attention, agents needing you, planning the next epic and finding a backlog task to fix now. The rail lists what needs you and every live session; the sidebar badge counts it. Make it the start page from its header or **Settings → General**.
- **Reviews page** (⌘⇧4): every pull request waiting on your review, one at a time like a mail client. Each shows the linked Jira task, the PR overview and diff, and the pinned agent helper (press `a`). Approve or request changes and the queue moves to the next one; `n`/`p` (or `]`/`[`) step through without leaving. The sidebar badge counts what is waiting.
- **Auto-fix**: when CI fails or a PR of yours gets merge conflicts, Deck starts a fix agent in the repo's local checkout (found by name under your repo roots). By default the agent stops with the diff and waits for your approval before pushing; **Settings → General** can let it push unattended, or turn either trigger off.

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
| ⌘⇧1 / ⌘⇧2 / ⌘⇧3 / ⌘⇧4 | Terminal / Board / Agent / Reviews |
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
