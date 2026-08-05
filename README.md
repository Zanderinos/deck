# deck

An AI-native terminal and agent workbench. Summon it from anywhere with <kbd>⌥ Space</kbd>.

deck is a desktop app for people whose day runs through coding agents: a real terminal that
runs Claude Code, global search over every past agent conversation on your machine, and a
Jira/GitHub work surface — one window instead of five.

## Status

Early. Currently building, in order:

1. ✅ App shell — global hotkey, tray, settings
2. Terminal tabs (node-pty + xterm.js)
3. Claude Code session tracking (hooks → live session list)
4. Global search over `~/.claude` conversations (SQLite FTS5)
5. Search fallbacks: repos, GitHub, Jira
6. Board + PR review surface

## Run

```bash
npm install
npm run dev
```

## Stack

Electron + electron-vite, React, Tailwind 4, better-sqlite3.

## License

MIT
