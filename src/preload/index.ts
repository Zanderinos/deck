import type { DeckTheme } from "../shared/themes.js";
import type { DeckPlugin, ExtensionCatalog } from "../shared/extensions.js";
import type { FileEntry, LocalFile } from "../main/files.js";
import type { Agent } from "../shared/agents.js";
import type { TermCreateOptions } from "../main/pty.js";
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
import type { GitSummary, WorkingChanges } from "../main/git.js";
import type { TermMeta } from "../main/pty.js";
import type { BoardCache } from "../main/jira.js";
import type { AskEvent, AskResult } from "../main/ask.js";
import type { PrInbox } from "../main/prInbox.js";
import type { AgentSession } from "../main/sessions.js";
import type { DeckSettings } from "../shared/settings.js";

const api = {
  onSettingsChanged: (cb: (settings: DeckSettings) => void): (() => void) => {
    const listener = (_e: unknown, settings: DeckSettings) => cb(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
  extensions: {
    get: (): Promise<ExtensionCatalog> => ipcRenderer.invoke("extensions:get"),
    openFolder: (kind: "themes" | "plugins"): Promise<void> => ipcRenderer.invoke("extensions:folder", kind),
    saveTheme: (theme: unknown): Promise<DeckTheme> => ipcRenderer.invoke("themes:save", theme),
    importTheme: (): Promise<DeckTheme | null> => ipcRenderer.invoke("themes:import"),
    installPlugin: (): Promise<DeckPlugin | null> => ipcRenderer.invoke("plugins:install"),
    enablePlugin: (root: string, enabled: boolean): Promise<void> => ipcRenderer.invoke("plugins:enable", root, enabled),
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on("extensions:changed", listener);
      return () => ipcRenderer.removeListener("extensions:changed", listener);
    },
  },
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
    merge: (
      repo: string,
      n: number,
      method: MergeMethod,
      issueKey?: string,
    ): Promise<PrActionResult> => ipcRenderer.invoke("gh:merge", repo, n, method, issueKey),
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
    onPrDrafts: (cb: (termId: string, drafts: DraftComment[]) => void): (() => void) => {
      const listener = (_e: unknown, termId: string, drafts: DraftComment[]) => cb(termId, drafts);
      ipcRenderer.on("pr:drafts", listener);
      return () => ipcRenderer.removeListener("pr:drafts", listener);
    },
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
  files: {
    list: (root: string, directory?: string): Promise<FileEntry[]> => ipcRenderer.invoke("files:list", root, directory),
    read: (root: string, file: string): Promise<LocalFile> => ipcRenderer.invoke("files:read", root, file),
    save: (root: string, file: string, contents: LocalFile): Promise<LocalFile> => ipcRenderer.invoke("files:save", root, file, contents),
  },
  git: {
    summary: (cwd: string): Promise<GitSummary | null> => ipcRenderer.invoke("git:summary", cwd),
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
    hooksInstalled: (agent: Agent = "claude"): Promise<boolean> => ipcRenderer.invoke("hooks:installed", agent),
    installHooks: (agent: Agent = "claude"): Promise<{ installed: boolean; path: string }> =>
      ipcRenderer.invoke("hooks:install", agent),
  },
  ask: {
    /** One turn of the deck conversation; text also streams via onDelta. */
    send: (question: string, agent?: Agent): Promise<AskResult> => ipcRenderer.invoke("ask:send", question, agent),
    reset: (): Promise<void> => ipcRenderer.invoke("ask:reset"),
    /** Answer text as it streams, and the deck tools the assistant calls. */
    onEvent: (cb: (event: AskEvent) => void): (() => void) => {
      const listener = (_e: unknown, event: AskEvent) => cb(event);
      ipcRenderer.on("ask:event", listener);
      return () => ipcRenderer.removeListener("ask:event", listener);
    },
  },
  window: {
    setFullScreen: (on: boolean): Promise<void> => ipcRenderer.invoke("window:fullscreen", on),
    isFullScreen: (): Promise<boolean> => ipcRenderer.invoke("window:isFullscreen"),
  },
  inbox: {
    get: (): Promise<PrInbox | undefined> => ipcRenderer.invoke("inbox:get"),
    refresh: (): Promise<PrInbox | undefined> => ipcRenderer.invoke("inbox:refresh"),
    onChanged: (cb: (inbox: PrInbox) => void): (() => void) => {
      const listener = (_e: unknown, inbox: PrInbox) => cb(inbox);
      ipcRenderer.on("inbox:changed", listener);
      return () => ipcRenderer.removeListener("inbox:changed", listener);
    },
  },
  term: {
    onCreated: (cb: (meta: TermMeta) => void): (() => void) => {
      const listener = (_e: unknown, meta: TermMeta) => cb(meta);
      ipcRenderer.on("term:created", listener);
      return () => ipcRenderer.removeListener("term:created", listener);
    },
    create: (opts?: TermCreateOptions): Promise<TermMeta> =>
      ipcRenderer.invoke("term:create", opts),
    list: (): Promise<TermMeta[]> => ipcRenderer.invoke("term:list"),
    /** Replays the terminal's recent output to this window, then streams live. */
    attach: (id: string): Promise<{ buffer: string; sequence: number }> => ipcRenderer.invoke("term:attach", id),
    input: (id: string, data: string): void => ipcRenderer.send("term:input", id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send("term:resize", id, cols, rows),
    kill: (id: string): void => ipcRenderer.send("term:kill", id),
    onData: (cb: (id: string, data: string, sequence: number) => void): (() => void) => {
      const listener = (_e: unknown, id: string, data: string, sequence: number) => cb(id, data, sequence);
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
