import { contextBridge, ipcRenderer } from "electron";
import type { DeckSettings } from "../shared/settings.js";

const api = {
  getSettings: (): Promise<DeckSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Partial<DeckSettings>): Promise<DeckSettings> =>
    ipcRenderer.invoke("settings:update", patch),
};

export type DeckApi = typeof api;

contextBridge.exposeInMainWorld("deck", api);
