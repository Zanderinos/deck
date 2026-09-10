import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { builtInThemes, parseTheme, type DeckTheme } from "../../../shared/themes.js";
import { parsePluginAction, parsePluginCommand, type ExtensionCatalog, type PluginAction, type PluginCommand, type PluginContext } from "../../../shared/extensions.js";
import { useTabs } from "../store.js";
import { openTerminalTab } from "../lib/bus.js";
import { useSettings } from "../lib/useSettings.js";
import { Icon } from "../board/icons.js";

export interface ExtensionCommand extends PluginCommand { key: string; pluginId: string; pluginName: string }
interface ExtensionState {
  catalog: ExtensionCatalog;
  themes: DeckTheme[];
  theme: DeckTheme;
  selectedThemeId: string;
  commands: ExtensionCommand[];
  errors: string[];
  selectTheme: (id: string) => Promise<void>;
  previewTheme: (theme?: DeckTheme) => void;
  reload: () => Promise<void>;
  runCommand: (command: ExtensionCommand) => Promise<void>;
}
const Context = createContext<ExtensionState | null>(null);
const emptyCatalog: ExtensionCatalog = { themes: builtInThemes, plugins: [], errors: [], themesDirectory: "", pluginsDirectory: "" };

export function ExtensionProvider({ children }: { children: ReactNode }) {
  const { tabs, activeId } = useTabs();
  const [catalog, setCatalog] = useState(emptyCatalog);
  const selected = useSettings()?.theme ?? "dark";
  const [preview, setPreview] = useState<DeckTheme>();
  const [commands, setCommands] = useState<ExtensionCommand[]>([]);
  const [runtimeThemes, setRuntimeThemes] = useState<DeckTheme[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [panel, setPanel] = useState<Extract<PluginAction, { type: "panel" }>>();
  const [notice, setNotice] = useState("");
  const workers = useRef(new Map<string, Worker>());
  const pending = useRef(new Map<string, { resolve: (action: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const reload = useCallback(async () => {
    try { setCatalog(await window.deck.extensions.get()); }
    catch (error) { setErrors([String(error)]); }
  }, []);
  useEffect(() => {
    void reload();
    const offCatalog = window.deck.extensions.onChanged(() => void reload());
    return offCatalog;
  }, [reload]);
  const themes = useMemo(() => [...new Map([...catalog.themes, ...runtimeThemes].map((theme) => [theme.id, theme])).values()], [catalog.themes, runtimeThemes]);
  const theme = preview ?? themes.find((theme) => theme.id === selected) ?? builtInThemes[0];
  useLayoutEffect(() => {
    for (const [key, value] of Object.entries(theme.colors)) document.documentElement.style.setProperty(`--color-${key}`, value);
    document.documentElement.style.colorScheme = theme.appearance;
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.dataset.appearance = theme.appearance;
  }, [theme]);
  const selectTheme = useCallback(async (id: string) => {
    await window.deck.updateSettings({ theme: id });
    setPreview(undefined);
  }, []);
  const active = tabs.find((tab) => tab.termId === activeId);
  const pluginContext: PluginContext = { cwd: active?.cwd, agent: active?.agent, sessionTitle: active?.customTitle || active?.title, theme: theme.id };
  const workerSignature = JSON.stringify(catalog.plugins.map(({ id, enabled, source }) => ({ id, enabled, source })));
  useEffect(() => {
    setCommands([]); setRuntimeThemes([]); setErrors([]);
    for (const plugin of catalog.plugins.filter((plugin) => plugin.enabled && plugin.source)) {
      const worker = new Worker(new URL("./pluginWorker.ts", import.meta.url), { type: "module" });
      workers.current.set(plugin.id, worker);
      worker.onmessage = ({ data }) => {
        try {
          if (data.type === "command") {
            const command = parsePluginCommand(data.command);
            const next = { ...command, key: `${plugin.id}:${command.id}`, pluginId: plugin.id, pluginName: plugin.name };
            setCommands((commands) => [...commands.filter((command) => command.key !== next.key), next]);
          } else if (data.type === "theme") {
            const theme = parseTheme(data.theme);
            const next = { ...theme, id: `${plugin.id}:${theme.id}`, source: plugin.name };
            setRuntimeThemes((themes) => [...themes.filter((theme) => theme.id !== next.id), next]);
          } else if (data.type === "result" || data.type === "error") {
            const request = pending.current.get(data.request);
            if (request) {
              clearTimeout(request.timer); pending.current.delete(data.request);
              if (data.type === "error") request.reject(new Error(data.error)); else request.resolve(data.action);
            } else if (data.type === "error") setErrors((errors) => [...errors, `${plugin.name}: ${data.error}`]);
          }
        } catch (error) { setErrors((errors) => [...errors, `${plugin.name}: ${String(error)}`]); }
      };
      worker.onerror = (event) => setErrors((errors) => [...errors, `${plugin.name}: ${event.message}`]);
      worker.postMessage({ type: "load", source: plugin.source });
    }
    return () => {
      for (const worker of workers.current.values()) worker.terminate();
      workers.current.clear();
      for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error("Plugin reloaded.")); }
      pending.current.clear();
    };
  }, [workerSignature]);
  useEffect(() => {
    for (const worker of workers.current.values()) worker.postMessage({ type: "event", event: "session:changed", context: pluginContext });
  }, [activeId, active?.cwd, active?.title, theme.id]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  const contributions = useMemo(() => [...new Map([
    ...catalog.plugins.filter((plugin) => plugin.enabled).flatMap((plugin) => plugin.commands.map((command) => ({ ...command, key: `${plugin.id}:${command.id}`, pluginId: plugin.id, pluginName: plugin.name }))),
    ...commands,
  ].map((command) => [command.key, command])).values()], [catalog.plugins, commands]);
  const runCommand = async (command: ExtensionCommand) => {
    try {
      let result: unknown = command.action;
      if (!result) {
        const worker = workers.current.get(command.pluginId);
        if (!worker) throw new Error("Plugin is not running. Reload it in Settings.");
        result = await new Promise((resolve, reject) => {
          const request = crypto.randomUUID();
          const timer = setTimeout(() => { pending.current.delete(request); reject(new Error("Plugin command timed out.")); }, 10000);
          pending.current.set(request, { resolve, reject, timer });
          worker.postMessage({ type: "run", request, command: command.id, context: pluginContext });
        });
      }
      if (result == null) return;
      const action = parsePluginAction(result);
      if (action.type === "terminal") { const { type: _, ...options } = action; openTerminalTab({ ...options, cwd: options.cwd ?? active?.cwd }); }
      if (action.type === "theme") {
        const id = themes.some((theme) => theme.id === action.theme) ? action.theme : `${command.pluginId}:${action.theme}`;
        if (!themes.some((theme) => theme.id === id)) throw new Error(`Theme not found: ${action.theme}`);
        await selectTheme(id);
      }
      if (action.type === "panel") setPanel(action);
      if (action.type === "notify") setNotice(action.message);
    } catch (error) { setNotice(String(error)); }
  };
  return <Context.Provider value={{ catalog, themes, theme, selectedThemeId: selected, commands: contributions, errors, selectTheme, previewTheme: setPreview, reload, runCommand }}>
    {children}
    {panel && <div className="fixed bottom-4 right-4 top-14 z-50 flex w-[440px] max-w-[90vw] flex-col rounded-xl border border-edge3 bg-panel font-sans shadow-2xl">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3 text-sm text-soft"><Icon name="grid" />{panel.title}<button title="Close plugin panel" className="ml-auto" onClick={() => setPanel(undefined)}><Icon name="x" /></button></div>
      <div className="md min-h-0 flex-1 overflow-auto p-4 text-sm leading-6 text-body"><ReactMarkdown>{panel.markdown}</ReactMarkdown></div>
    </div>}
    {notice && <div role="status" className="fixed bottom-12 right-4 z-[60] flex max-w-md items-center gap-3 rounded-lg border border-edge3 bg-overlay px-4 py-3 font-sans text-xs text-soft shadow-xl">{notice}<button title="Dismiss notification" onClick={() => setNotice("")}><Icon name="x" size={11} /></button></div>}
  </Context.Provider>;
}
export function useExtensions(): ExtensionState {
  const state = useContext(Context);
  if (!state) throw new Error("useExtensions outside ExtensionProvider");
  return state;
}
