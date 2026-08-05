import { kvGet, kvSet } from "./db.js";
import { getSettings } from "./settings.js";

// Read-only Jira board mirror, adapted from slate's jira client. Configured
// entirely through settings (base url, email, api token, board id) — nothing
// vendor-specific in code. Writes (transitions) are a later slice.

export interface BoardColumn {
  name: string;
  statusIds: string[];
}

export interface BoardIssue {
  key: string;
  summary: string;
  statusId: string;
  statusName: string;
  assignee: string | null;
  updated: string;
}

export interface BoardCache {
  boardName: string;
  columns: BoardColumn[];
  issues: BoardIssue[];
  at: number;
}

function config() {
  const { jira } = getSettings();
  return jira;
}

export function jiraConfigured(): boolean {
  const c = config();
  return Boolean(c.baseUrl && c.email && c.apiToken && c.boardId);
}

async function request<T>(path: string): Promise<T> {
  const c = config();
  const auth = Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
  const res = await fetch(`${c.baseUrl.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Jira ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

interface AgileConfiguration {
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
}

interface AgileIssuePage {
  issues: {
    key: string;
    fields: {
      summary: string;
      status: { id: string; name: string };
      assignee: { displayName: string } | null;
      updated: string;
    };
  }[];
  total: number;
}

const CACHE_KEY = "board_cache";
const listeners = new Set<(b: BoardCache) => void>();
let timer: NodeJS.Timeout | undefined;
let syncing = false;

export function onBoardChanged(cb: (b: BoardCache) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getBoardCache(): BoardCache | undefined {
  return kvGet<BoardCache>(CACHE_KEY);
}

export async function syncBoard(): Promise<BoardCache | undefined> {
  if (!jiraConfigured() || syncing) return getBoardCache();
  syncing = true;
  try {
    const c = config();
    const [board, conf] = await Promise.all([
      request<{ name: string }>(`/rest/agile/1.0/board/${c.boardId}`),
      request<AgileConfiguration>(`/rest/agile/1.0/board/${c.boardId}/configuration`),
    ]);
    const columns: BoardColumn[] = conf.columnConfig.columns.map((col) => ({
      name: col.name,
      statusIds: col.statuses.map((s) => s.id),
    }));

    // Without a JQL guard the agile endpoint returns the board's entire
    // history (thousands of Done issues). Keep the active board + a week of
    // Done, and cap pagination as a backstop.
    const jql = encodeURIComponent("statusCategory != Done OR updated >= -7d");
    const issues: BoardIssue[] = [];
    for (let startAt = 0; startAt < 1000; ) {
      const page = await request<AgileIssuePage>(
        `/rest/agile/1.0/board/${c.boardId}/issue?startAt=${startAt}&maxResults=100&jql=${jql}&fields=summary,status,assignee,updated`,
      );
      for (const i of page.issues) {
        issues.push({
          key: i.key,
          summary: i.fields.summary,
          statusId: i.fields.status.id,
          statusName: i.fields.status.name,
          assignee: i.fields.assignee?.displayName ?? null,
          updated: i.fields.updated,
        });
      }
      startAt += page.issues.length;
      if (startAt >= page.total || page.issues.length === 0) break;
    }

    const cache: BoardCache = { boardName: board.name, columns, issues, at: Date.now() };
    kvSet(CACHE_KEY, cache);
    for (const cb of listeners) cb(cache);
    return cache;
  } finally {
    syncing = false;
  }
}

export function startBoardSync(): void {
  const tick = () => void syncBoard().catch(() => {});
  tick();
  timer = setInterval(tick, 60_000);
}

export function stopBoardSync(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
