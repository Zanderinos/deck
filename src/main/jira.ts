import { kvGet, kvSet } from "./db.js";
import { getSettings } from "./settings.js";

// Jira board mirror, adapted from slate's jira client. Configured entirely
// through settings (base url, email, api token, board id) — nothing
// vendor-specific in code. The one write is moving a card between columns.

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
  /** Jira account id of the assignee — how "mine" is decided. */
  assigneeId: string | null;
  updated: string;
}

export interface BoardCache {
  boardName: string;
  columns: BoardColumn[];
  issues: BoardIssue[];
  /** Account id of the authenticated user, absent on caches from older syncs. */
  myAccountId?: string;
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

async function request<T>(path: string, body?: unknown): Promise<T> {
  const c = config();
  const auth = Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
  const res = await fetch(`${c.baseUrl.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Jira ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  }
  // Transitions answer 204 with an empty body.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface Transitions {
  transitions: { id: string; name: string; to: { id: string; name: string } }[];
}

/** Moves a card to a column by firing the workflow transition that lands in
 *  one of that column's statuses. Updates the cache so the board reflects the
 *  move before the next sync. */
export async function moveIssue(key: string, columnName: string): Promise<BoardCache> {
  const cache = getBoardCache();
  const column = cache?.columns.find((c) => c.name === columnName);
  if (!cache || !column) throw new Error(`Unknown column ${columnName}`);
  const { transitions } = await request<Transitions>(`/rest/api/3/issue/${key}/transitions`);
  // Several statuses can share a column (Done also holds Cancelled), so
  // prefer the status named like the column, then the column's own order.
  const transition =
    transitions.find((t) => t.to.name.toLowerCase() === columnName.toLowerCase()) ??
    column.statusIds.map((id) => transitions.find((t) => t.to.id === id)).find(Boolean);
  if (!transition) {
    throw new Error(`${key} has no transition into "${columnName}" from its current status`);
  }
  await request(`/rest/api/3/issue/${key}/transitions`, { transition: { id: transition.id } });
  const next: BoardCache = {
    ...cache,
    issues: cache.issues.map((i) =>
      i.key === key ? { ...i, statusId: transition.to.id, statusName: transition.to.name } : i,
    ),
  };
  kvSet(CACHE_KEY, next);
  for (const cb of listeners) cb(next);
  return next;
}

interface AgileConfiguration {
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
  /** Kanban board sub-filter — applied to the display, not the issue endpoint. */
  subQuery?: { query?: string };
}

interface AgileIssuePage {
  issues: {
    key: string;
    fields: {
      summary: string;
      status: { id: string; name: string };
      assignee: { displayName: string; accountId: string } | null;
      updated: string;
      issuetype?: { name?: string; hierarchyLevel?: number };
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
    const [board, conf, me] = await Promise.all([
      request<{ name: string }>(`/rest/agile/1.0/board/${c.boardId}`),
      request<AgileConfiguration>(`/rest/agile/1.0/board/${c.boardId}/configuration`),
      request<{ accountId: string }>("/rest/api/3/myself"),
    ]);
    const columns: BoardColumn[] = conf.columnConfig.columns.map((col) => ({
      name: col.name,
      statusIds: col.statuses.map((s) => s.id),
    }));

    // The issue endpoint applies the board filter but NOT the kanban
    // sub-filter, and returns epics that never show as cards — apply both
    // ourselves so counts match what Jira displays. The date guard keeps the
    // Done column from dragging in the board's entire history.
    const doneGuard = `statusCategory != Done OR statusCategoryChangedDate >= -${
      c.doneWindowDays || 7
    }d`;
    const sub = conf.subQuery?.query?.trim();
    const jql = encodeURIComponent(sub ? `(${sub}) AND (${doneGuard})` : doneGuard);
    const issues: BoardIssue[] = [];
    for (let startAt = 0; startAt < 1000; ) {
      const page = await request<AgileIssuePage>(
        `/rest/agile/1.0/board/${c.boardId}/issue?startAt=${startAt}&maxResults=100&jql=${jql}&fields=summary,status,assignee,updated,issuetype`,
      );
      for (const i of page.issues) {
        // Kanban cards are standard-level issues only: no epics (level 1+),
        // no sub-tasks (level -1).
        const t = i.fields.issuetype;
        const isCard =
          t?.hierarchyLevel != null
            ? t.hierarchyLevel === 0
            : !/^(epic|sub-?task)$/i.test(t?.name ?? "");
        if (!isCard) continue;
        issues.push({
          key: i.key,
          summary: i.fields.summary,
          statusId: i.fields.status.id,
          statusName: i.fields.status.name,
          assignee: i.fields.assignee?.displayName ?? null,
          assigneeId: i.fields.assignee?.accountId ?? null,
          updated: i.fields.updated,
        });
      }
      startAt += page.issues.length;
      if (startAt >= page.total || page.issues.length === 0) break;
    }

    // The issue endpoint also returns the kanban backlog, which does not
    // belong on the board (it inflates the first column). Subtract it.
    const backlog = new Set<string>();
    for (let startAt = 0; startAt < 2000; ) {
      const page = await request<AgileIssuePage>(
        `/rest/agile/1.0/board/${c.boardId}/backlog?startAt=${startAt}&maxResults=100&fields=status`,
      );
      for (const i of page.issues) backlog.add(i.key);
      startAt += page.issues.length;
      if (startAt >= page.total || page.issues.length === 0) break;
    }
    const boardIssues = issues.filter((i) => !backlog.has(i.key));

    const cache: BoardCache = {
      boardName: board.name,
      columns,
      issues: boardIssues,
      myAccountId: me.accountId,
      at: Date.now(),
    };
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
