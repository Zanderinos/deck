import { contextBridge, ipcRenderer } from "electron";
import type { DeckSettings } from "../shared/settings.js";

const api = {
  getSettings: (): Promise<DeckSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Partial<DeckSettings>): Promise<DeckSettings> =>
    ipcRenderer.invoke("settings:update", patch),
  term: {
    create: (opts?: { cwd?: string; command?: string }): Promise<string> =>
      ipcRenderer.invoke("term:create", opts),
    input: (id: string, data: string): void => ipcRenderer.send("term:input", id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send("term:resize", id, cols, rows),
    kill: (id: string): void => ipcRenderer.send("term:kill", id),
    onData: (cb: (id: string, data: string) => void): (() => void) => {
      const listener = (_e: unknown, id: string, data: string) => cb(id, data);
      ipcRenderer.on("term:data", listener);
      return () => ipcRenderer.removeListener("term:data", listener);
    },
    onExit: (cb: (id: string, code: number) => void): (() => void) => {
      const listener = (_e: unknown, id: string, code: number) => cb(id, code);
      ipcRenderer.on("term:exit", listener);
      return () => ipcRenderer.removeListener("term:exit", listener);
    },
  },
};

export type DeckApi = typeof api;

contextBridge.exposeInMainWorld("deck", api);
