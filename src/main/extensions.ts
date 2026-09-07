import { app, dialog, shell } from "electron";
import { watch, type FSWatcher } from "chokidar";
import fs from "node:fs";
import path from "node:path";
import { builtInThemes, parseTheme, type DeckTheme } from "../shared/themes.js";
import { parsePluginCommand, type DeckPlugin, type ExtensionCatalog } from "../shared/extensions.js";
import { kvGet, kvSet } from "./db.js";

interface InstalledPlugin { path: string; enabled: boolean }
let watcher: FSWatcher | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export function onExtensionsChanged(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function changed(): void { for (const listener of listeners) listener(); }
const folders = () => ({ themesDirectory: path.join(app.getPath("userData"), "themes"), pluginsDirectory: path.join(app.getPath("userData"), "plugins") });
const installed = () => kvGet<InstalledPlugin[]>("plugins") ?? [];

function readJson(file: string): unknown {
  if (fs.statSync(file).size > 1_000_000) throw new Error("Extension file exceeds 1 MB.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function pluginFile(root: string, relative: string): string {
  const canonicalRoot = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(root, relative));
  const inside = path.relative(canonicalRoot, file);
  if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error("Plugin files must stay inside the plugin folder.");
  return file;
}
export function loadPlugin(root: string, enabled = true): DeckPlugin {
  const manifest = readJson(pluginFile(root, "deck-plugin.json")) as Record<string, unknown>;
  if (!manifest || typeof manifest !== "object" || manifest.apiVersion !== 1) throw new Error("Plugin requires apiVersion: 1.");
  if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) throw new Error("Invalid plugin id.");
  if (typeof manifest.name !== "string" || !manifest.name.trim() || typeof manifest.version !== "string") throw new Error("Plugin needs a name and version.");
  const commands = (Array.isArray(manifest.commands) ? manifest.commands : []).map(parsePluginCommand);
  if (new Set(commands.map((command) => command.id)).size !== commands.length) throw new Error("Duplicate command id.");
  const themes: DeckTheme[] = enabled ? (Array.isArray(manifest.themes) ? manifest.themes : []).map((file) => {
    if (typeof file !== "string") throw new Error("Theme paths must be strings.");
    const theme = parseTheme(readJson(pluginFile(root, file)));
    return { ...theme, id: `${manifest.id}:${theme.id}`, source: String(manifest.name) };
  }) : [];
  let source: string | undefined;
  if (enabled && manifest.entry !== undefined) {
    if (typeof manifest.entry !== "string") throw new Error("Plugin entry must be a JavaScript file path.");
    const file = pluginFile(root, manifest.entry);
    if (fs.statSync(file).size > 1_000_000) throw new Error("Plugin entry exceeds 1 MB. Bundle a smaller extension.");
    source = fs.readFileSync(file, "utf8");
  }
  return { id: manifest.id, name: manifest.name, version: manifest.version, description: typeof manifest.description === "string" ? manifest.description : undefined, path: root, enabled, commands, themes, source };
}

export function extensionCatalog(): ExtensionCatalog {
  const directories = folders();
  const themes = [...builtInThemes];
  const errors: string[] = [];
  const plugins: DeckPlugin[] = [];
  if (fs.existsSync(directories.themesDirectory)) for (const file of fs.readdirSync(directories.themesDirectory).filter((file) => file.endsWith(".json"))) {
    try { const theme = parseTheme(readJson(path.join(directories.themesDirectory, file))); themes.push({ ...theme, id: `custom:${theme.id}`, source: "Custom" }); }
    catch (error) { errors.push(`${file}: ${String(error)}`); }
  }
  const roots = new Map(installed().map((plugin) => [plugin.path, plugin.enabled]));
  if (fs.existsSync(directories.pluginsDirectory)) for (const entry of fs.readdirSync(directories.pluginsDirectory, { withFileTypes: true })) {
    if (entry.isDirectory()) { const root = path.join(directories.pluginsDirectory, entry.name); if (!roots.has(root)) roots.set(root, true); }
  }
  const ids = new Set<string>();
  for (const [root, enabled] of roots) {
    try {
      const plugin = loadPlugin(root, enabled);
      if (ids.has(plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`);
      ids.add(plugin.id); plugins.push(plugin);
      if (enabled) themes.push(...plugin.themes);
    } catch (error) { plugins.push({ id: root, name: path.basename(root), version: "", path: root, enabled, commands: [], themes: [], error: String(error) }); }
  }
  return { ...directories, themes, plugins, errors };
}

export function startExtensions(): void {
  const directories = folders();
  for (const folder of Object.values(directories)) fs.mkdirSync(folder, { recursive: true });
  void watcher?.close();
  watcher = watch([...Object.values(directories), ...installed().map((plugin) => plugin.path)], {
    ignoreInitial: true, depth: 5, ignored: /(?:^|[/\\])(?:node_modules|\.git)(?:[/\\]|$)/,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  });
  watcher.on("all", () => { clearTimeout(timer); timer = setTimeout(changed, 150); });
  watcher.on("error", (error) => console.warn("Extension watcher:", error));
}
export function stopExtensions(): void { clearTimeout(timer); void watcher?.close(); watcher = undefined; }

export function saveTheme(value: unknown): DeckTheme {
  const theme = parseTheme(value);
  fs.mkdirSync(folders().themesDirectory, { recursive: true });
  fs.writeFileSync(path.join(folders().themesDirectory, `${theme.id}.json`), JSON.stringify(theme, null, 2) + "\n");
  changed();
  return { ...theme, id: `custom:${theme.id}`, source: "Custom" };
}
export async function importTheme(): Promise<DeckTheme | null> {
  const result = await dialog.showOpenDialog({ title: "Import Deck theme", properties: ["openFile"], filters: [{ name: "Deck theme", extensions: ["json"] }] });
  return result.canceled || !result.filePaths[0] ? null : saveTheme(readJson(result.filePaths[0]));
}
export async function installPlugin(): Promise<DeckPlugin | null> {
  const result = await dialog.showOpenDialog({ title: "Install plugin folder", properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = fs.realpathSync(result.filePaths[0]);
  const plugin = loadPlugin(root);
  const duplicate = extensionCatalog().plugins.find((other) => other.id === plugin.id && other.path !== root);
  if (duplicate) throw new Error(`Plugin ${plugin.id} is already installed from ${duplicate.path}.`);
  kvSet("plugins", [...installed().filter((other) => other.path !== root), { path: root, enabled: true }]);
  startExtensions(); changed(); return plugin;
}
export function enablePlugin(root: string, enabled: boolean): void {
  if (!extensionCatalog().plugins.some((plugin) => plugin.path === root)) throw new Error("Plugin is not installed.");
  kvSet("plugins", [...installed().filter((plugin) => plugin.path !== root), { path: root, enabled }]);
  changed();
}
export async function openExtensionFolder(kind: "themes" | "plugins"): Promise<void> {
  const folder = kind === "themes" ? folders().themesDirectory : folders().pluginsDirectory;
  fs.mkdirSync(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
}
