// Plugin code runs off the UI thread with no Node or Electron bridge.
const handlers = new Map<string, (context: unknown) => unknown>();
const events = new Map<string, Set<(context: unknown) => void>>();
let dispose: (() => void) | undefined;
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.type === "load") {
      const url = URL.createObjectURL(new Blob([data.source], { type: "text/javascript" }));
      try {
        const module = await import(/* @vite-ignore */ url);
        if (typeof module.default !== "function") throw new Error("Plugin entry must export a default activate function.");
        dispose = await module.default({
          registerCommand(id: string, command: { title: string; description?: string; run: (context: unknown) => unknown }) {
            if (typeof command.run !== "function") throw new Error("Command requires a run function.");
            handlers.set(id, command.run);
            self.postMessage({ type: "command", command: { id, title: command.title, description: command.description } });
          },
          registerTheme(theme: unknown) { self.postMessage({ type: "theme", theme }); },
          registerPanel(id: string, panel: { title: string; markdown: string }) {
            handlers.set(id, () => ({ type: "panel", ...panel }));
            self.postMessage({ type: "command", command: { id, title: panel.title } });
          },
          on(event: string, handler: (context: unknown) => void) {
            const listeners = events.get(event) ?? new Set(); listeners.add(handler); events.set(event, listeners);
            return () => listeners.delete(handler);
          },
        });
        self.postMessage({ type: "ready" });
      } finally { URL.revokeObjectURL(url); }
    } else if (data.type === "run") {
      const handler = handlers.get(data.command);
      if (!handler) throw new Error("Plugin command is unavailable.");
      const action = await handler(data.context);
      self.postMessage({ type: "result", request: data.request, action });
    } else if (data.type === "event") {
      for (const handler of events.get(data.event) ?? []) handler(data.context);
    } else if (data.type === "dispose") {
      dispose?.();
      self.close();
    }
  } catch (error) {
    self.postMessage({ type: "error", request: data.request, error: error instanceof Error ? error.message : String(error) });
  }
};
