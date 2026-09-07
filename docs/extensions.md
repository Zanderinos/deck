# Themes and plugins

Deck has a local extension API inspired by Pi's theme and command model. This is Deck API version 1; Pi extensions need to be adapted to this API.

## Themes

Open **Settings → Appearance** to choose Carbon, Midnight, Forest, Rose Pine, or Paper. Hover to preview; click to save across windows and restarts. Terminals update immediately without restarting their processes.

**Customize** opens an editable JSON copy of the current palette. Preview it, then save. **Import theme** accepts the same JSON format. **Open themes folder** reveals the directory where you can edit or share theme files. Files reload automatically.

Minimal example:

```json
{
  "id": "my-ocean",
  "name": "My Ocean",
  "extends": "midnight",
  "colors": { "accent": "#64d8cb", "bg": "#0b171e" },
  "terminal": { "cyan": "#64d8cb" }
}
```

`id` is a lowercase slug; `name` is a display name. `extends` accepts a built-in id: `dark`, `midnight`, `forest`, `rose`, `light`. You may also set `appearance` to `dark` or `light`. Unspecified colors inherit from the base theme. Colors accept hex values (`#rgb`, `#rrggbb`, `#rrggbbaa`). Invalid files display errors without preventing the app from opening.

UI tokens: `bg`, `panel`, `card`, `card2`, `overlay`, `edge`, `edge2`, `edge3`, `ink`, `body`, `soft`, `mut`, `dim`, `accent`, `green`, `blue`, `orange`, `red`.

Terminal tokens: `background`, `foreground`, `cursor`, `selectionBackground`, the ANSI colors `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, and their `brightBlack` through `brightWhite` variants. Background, foreground and cursor follow UI tokens unless overridden.

Custom theme selection ids use `custom:<id>`; plugin theme ids use `<plugin-id>:<theme-id>`.

## Create a plugin

Copy `examples/plugins/workspace-kit` and install your copy using **Settings → Plugins → Install plugin…**. Deck references the folder in place so edits reload automatically. Alternatively place a plugin folder inside **Open folder**. Enable or disable plugins in Settings.

Every plugin needs `deck-plugin.json`:

```json
{
  "apiVersion": 1,
  "id": "my-tools",
  "name": "My Tools",
  "version": "1.0.0",
  "description": "Tools for my daily work",
  "entry": "index.js",
  "themes": ["ocean.json"],
  "commands": [
    {
      "id": "review",
      "title": "Review with Codex",
      "action": { "type": "terminal", "agent": "codex", "prompt": "Review the current changes without editing files." }
    }
  ]
}
```

`entry`, `themes`, and `commands` are optional. A theme-only or declarative-command plugin needs no JavaScript. Paths must remain inside the plugin folder, including symlink targets. JSON and entry files are limited to 1 MB each. Plugin ids and command ids are lowercase slugs and must be unique within their scope.

JavaScript entries are ES modules with a default activation function:

```js
export default function activate(deck) {
  deck.registerCommand('hello', {
    title: 'Show workspace',
    run(context) {
      return {
        type: 'panel',
        title: 'Workspace',
        markdown: `Directory: ${context.cwd || 'No terminal selected'}`,
      };
    },
  });
  deck.registerPanel('help', { title: 'Team help', markdown: 'Your team notes here.' });
  deck.registerTheme({ id: 'violet', name: 'Violet', colors: { accent: '#bd93f9' } });
  deck.on('session:changed', (context) => { /* update local plugin state */ });
}
```

Use `src/shared/plugin-api.ts` for TypeScript/JSDoc types. Bundle dependencies into a single JavaScript entry; relative imports and Node packages are not loaded by Deck. The sample plugin is ready to install without a build step.

## Commands and context

Commands appear in **⌘K** and on the plugin's Settings card. A command may return an action, a promise of an action, or nothing. Commands have a ten-second response timeout.

| Action | Fields | Behavior |
| --- | --- | --- |
| `terminal` | optional `cwd`, `command`, `agent`, `prompt`, `sessionId` | Opens a shell or a Claude/Codex session. Defaults to the current directory. Agent prompts are shell-quoted by Deck. Use either an agent launch or a raw shell command. |
| `panel` | `title`, `markdown` | Opens a closable Markdown panel; raw HTML is not rendered. |
| `theme` | `theme` | Selects a built-in, custom, or plugin theme. A plugin may use its own unqualified theme id. |
| `notify` | `message` | Shows a dismissible notification. |

Context contains `cwd`, `agent`, `sessionTitle`, and the current `theme` id. It does not include conversation contents, credentials, or terminal output. `session:changed` is sent when the selected terminal or its workspace/theme changes; use command context for the latest values when a command runs.

Plugin code runs in a dedicated web worker with no Node/Electron bridge or direct access to Deck's React tree. It can use browser worker APIs, including network requests. Install code you trust. Terminal actions run only when you invoke a command; normal agent permission controls remain active. Disabling/reloading a plugin terminates its worker and removes its contributions. Deck does not currently provide an npm marketplace, arbitrary React components, or Pi's model/tool extension API.

Directories live under Electron's Deck user-data folder (normally `~/Library/Application Support/deck` on macOS). Use the Settings folder buttons to locate the actual directories for your installation.
