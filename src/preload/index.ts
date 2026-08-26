import { contextBridge, ipcRenderer } from "electron";
import type { ConvMessage, IndexProgress, SearchHit } from "../main/indexer.js";
import type { GithubHit, RepoDir, RepoHit } from "../main/providers.js";
import type {
  DraftComment,
  IssuePr,
  MergeMethod,
  PrActionResult,
  PrComment,
  PrDetail,
  PrTimelineEvent,
  ReviewEvent,
} from "../main/github.js";
import type { WorkingChanges } from "../main/git.js";
import type { TermMeta } from "../main/pty.js";
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
    onPrsChanged: (cb: (key: string, prs: IssuePr[]) => void): (() => void) => {
      const listener = (_e: unknown, key: string, prs: IssuePr[]) => cb(key, prs);
      ipcRenderer.on("prs:changed", listener);
      return () => ipcRenderer.removeListener("prs:changed", listener);
    },
    prDetail: (repo: string, n: number): Promise<PrDetail | null> =>
      ipcRenderer.invoke("gh:prDetail", repo, n),
    prDiff: (repo: string, n: number): Promise<string> => ipcRenderer.invoke("gh:prDiff", repo, n),
    prComments: (repo: string, n: number): Promise<PrComment[]> =>
      ipcRenderer.invoke("gh:prComments", repo, n),
    prTimeline: (repo: string, n: number): Promise<PrTimelineEvent[]> =>
      ipcRenderer.invoke("gh:prTimeline", repo, n),
    review: (
      repo: string,
      n: number,
      event: ReviewEvent,
      body: string,
      comments: DraftComment[],
    ): Promise<PrActionResult> => ipcRenderer.invoke("gh:review", repo, n, event, body, comments),
    merge: (repo: string, n: number, method: MergeMethod): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:merge", repo, n, method),
    setFileViewed: (prId: string, path: string, viewed: boolean): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:setFileViewed", prId, path, viewed),
    autoMerge: (repo: string, n: number, method: MergeMethod): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:autoMerge", repo, n, method),
    replyToThread: (threadId: string, body: string): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:replyToThread", threadId, body),
    setThreadResolved: (threadId: string, resolved: boolean): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:setThreadResolved", threadId, resolved),
    addComment: (repo: string, n: number, body: string): Promise<PrActionResult> =>
      ipcRenderer.invoke("gh:addComment", repo, n, body),
    fileContent: (repo: string, ref: string, path: string): Promise<string | null> =>
      ipcRenderer.invoke("gh:fileContent", repo, ref, path),
  },
  board: {
    get: (): Promise<BoardCache | undefined> => ipcRenderer.invoke("board:get"),
    sync: (): Promise<BoardCache | undefined> => ipcRenderer.invoke("board:sync"),
    move: (key: string, column: string): Promise<BoardCache> =>
      ipcRenderer.invoke("board:move", key, column),
    onChanged: (cb: (b: BoardCache) => void): (() => void) => {
      const listener = (_e: unknown, b: BoardCache) => cb(b);
      ipcRenderer.on("board:changed", listener);
      return () => ipcRenderer.removeListener("board:changed", listener);
    },
  },
  git: {
    changes: (cwd: string): Promise<WorkingChanges> => ipcRenderer.invoke("git:changes", cwd),
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
    create: (opts?: { cwd?: string; command?: string; issueKey?: string }): Promise<TermMeta> =>
      ipcRenderer.invoke("term:create", opts),
    list: (): Promise<TermMeta[]> => ipcRenderer.invoke("term:list"),
    /** Replays the terminal's recent output to this window, then streams live. */
    attach: (id: string): Promise<void> => ipcRenderer.invoke("term:attach", id),
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
