import { contextBridge, ipcRenderer } from "electron";
import type { ConvMessage, IndexProgress, SearchHit } from "../main/indexer.js";
import type { GithubHit, RepoDir, RepoHit } from "../main/providers.js";
import type { IssuePr, PrDetail } from "../main/github.js";
import type { BoardCache } from "../main/jira.js";
import type { AgentSession } from "../main/sessions.js";
import type { DeckSettings } from "../shared/settings.js";

const api = {
  getSettings: (): Promise<DeckSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Partial<DeckSettings>): Promise<DeckSettings> =>
    ipcRenderer.invoke("settings:update", patch),
  search: {
    query: (q: string): Promise<SearchHit[]> => ipcRenderer.invoke("search:query", q),
    session: (id: string): Promise<ConvMessage[]> => ipcRenderer.invoke("search:session", id),
    repos: (q: string): Promise<RepoHit[]> => ipcRenderer.invoke("search:repos", q),
    github: (q: string): Promise<GithubHit[]> => ipcRenderer.invoke("search:github", q),
    listRepos: (): Promise<RepoDir[]> => ipcRenderer.invoke("repos:list"),
    progress: (): Promise<IndexProgress> => ipcRenderer.invoke("index:progress"),
    onProgress: (cb: (p: IndexProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: IndexProgress) => cb(p);
      ipcRenderer.on("index:progress", listener);
      return () => ipcRenderer.removeListener("index:progress", listener);
    },
  },
  gh: {
    prsForIssue: (key: string): Promise<IssuePr[]> => ipcRenderer.invoke("gh:prsForIssue", key),
    prDetail: (repo: string, n: number): Promise<PrDetail | null> =>
      ipcRenderer.invoke("gh:prDetail", repo, n),
    prDiff: (repo: string, n: number): Promise<string> => ipcRenderer.invoke("gh:prDiff", repo, n),
  },
  board: {
    get: (): Promise<BoardCache | undefined> => ipcRenderer.invoke("board:get"),
    sync: (): Promise<BoardCache | undefined> => ipcRenderer.invoke("board:sync"),
    onChanged: (cb: (b: BoardCache) => void): (() => void) => {
      const listener = (_e: unknown, b: BoardCache) => cb(b);
      ipcRenderer.on("board:changed", listener);
      return () => ipcRenderer.removeListener("board:changed", listener);
    },
  },
  sessions: {
    list: (): Promise<AgentSession[]> => ipcRenderer.invoke("sessions:list"),
    remove: (id: string): Promise<void> => ipcRenderer.invoke("sessions:remove", id),
    onChanged: (cb: (sessions: AgentSession[]) => void): (() => void) => {
      const listener = (_e: unknown, sessions: AgentSession[]) => cb(sessions);
      ipcRenderer.on("sessions:changed", listener);
      return () => ipcRenderer.removeListener("sessions:changed", listener);
    },
    hooksInstalled: (): Promise<boolean> => ipcRenderer.invoke("hooks:installed"),
    installHooks: (): Promise<{ installed: boolean; path: string }> =>
      ipcRenderer.invoke("hooks:install"),
  },
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
