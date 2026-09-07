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
  /** Numeric Jira id, needed by the dev-status (linked PR) endpoints. */
  id: string;
  key: string;
  summary: string;
  statusId: string;
  statusName: string;
  assignee: string | null;
  /** Jira account id of the assignee — how "mine" is decided. */
  assigneeId: string | null;
  updated: string;
  /** Set when the card sits in a column deck moved it to locally, not Jira. */
  localMove?: true;
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
  const raw = kvGet<BoardCache>(CACHE_KEY) ?? cache;
  return publish({
    ...raw,
    issues: raw.issues.map((i) =>
      i.key === key ? { ...i, statusId: transition.to.id, statusName: transition.to.name } : i,
    ),
  });
}

/** Cards moved on deck's board only, keyed by issue. Each remembers the Jira
 *  status it was moved away from: once Jira reports anything else the move
 *  has been overtaken (Jira's own automation caught up, or someone moved the
 *  card) and is dropped. */
interface LocalMove {
  fromStatusId: string;
  column: string;
}

const LOCAL_MOVES_KEY = "board_local_moves";

function applyLocalMoves(raw: BoardCache): BoardCache {
  const moves = kvGet<Record<string, LocalMove>>(LOCAL_MOVES_KEY) ?? {};
  const kept: Record<string, LocalMove> = {};
  const issues = raw.issues.map((issue) => {
    const move = moves[issue.key];
    const column = move && raw.columns.find((c) => c.name === move.column);
    if (!move || !column || issue.statusId !== move.fromStatusId) return issue;
    kept[issue.key] = move;
    return {
      ...issue,
      statusId: column.statusIds[0],
      statusName: column.name,
      localMove: true as const,
    };
  });
  if (Object.keys(kept).length !== Object.keys(moves).length) kvSet(LOCAL_MOVES_KEY, kept);
  return { ...raw, issues };
}

/** Stores the Jira truth and hands listeners the board as deck shows it. */
function publish(raw: BoardCache): BoardCache {
  kvSet(CACHE_KEY, raw);
  const shown = applyLocalMoves(raw);
  for (const cb of listeners) cb(shown);
  return shown;
}

/** Runs the configured on-merge action for an issue: a Jira transition, or a
 *  board-only move that keeps the card out of the way while Jira's own
 *  automation is still on its way. */
export async function afterPrMerged(key: string): Promise<void> {
  const { onMerge } = config();
  if (!onMerge.enabled || !onMerge.column) return;
  if (onMerge.mode === "jira") {
    await moveIssue(key, onMerge.column);
    return;
  }
  const raw = kvGet<BoardCache>(CACHE_KEY);
  const issue = raw?.issues.find((i) => i.key === key);
  const column = raw?.columns.find((c) => c.name === onMerge.column);
  if (!raw || !issue || !column) {
    throw new Error(`Unknown issue ${key} or column ${onMerge.column}`);
  }
  if (column.statusIds.includes(issue.statusId)) return;
  const moves = kvGet<Record<string, LocalMove>>(LOCAL_MOVES_KEY) ?? {};
  moves[key] = { fromStatusId: issue.statusId, column: column.name };
  kvSet(LOCAL_MOVES_KEY, moves);
  publish(raw);
}

export interface LinkedPullRequest {
  /** Full "owner/repo" as GitHub names it. */
  repo: string;
  number: number;
  title: string;
  /** OPEN, MERGED, DECLINED or DRAFT. */
  status: string;
  url: string;
  lastUpdate: string;
}

interface DevStatusSummary {
  summary: { pullrequest?: { byInstanceType?: Record<string, unknown> } };
}

interface DevStatusDetail {
  detail: {
    pullRequests: {
      id: string;
      name: string;
      status: string;
      url: string;
      lastUpdate: string;
      repositoryName: string;
    }[];
  }[];
}

/** Pull requests the GitHub-for-Jira integration attached to an issue. The
 *  detail endpoint wants the integration's instance type, which the summary
 *  reports, so this is two requests instead of a hardcoded vendor string. */
export async function linkedPullRequests(issueId: string): Promise<LinkedPullRequest[]> {
  const { summary } = await request<DevStatusSummary>(
    `/rest/dev-status/latest/issue/summary?issueId=${issueId}`,
  );
  const types = Object.keys(summary.pullrequest?.byInstanceType ?? {});
  const details = await Promise.all(
    types.map((type) =>
      request<DevStatusDetail>(
        `/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${encodeURIComponent(type)}&dataType=pullrequest`,
      ),
    ),
  );
  return details
    .flatMap((d) => d.detail)
    .flatMap((d) => d.pullRequests)
    .map((pr) => ({
      repo: pr.repositoryName,
      number: Number(pr.id.replace(/^#/, "")),
      title: pr.name,
      status: pr.status,
      url: pr.url,
      lastUpdate: pr.lastUpdate,
    }));
}

interface AgileConfiguration {
  columnConfig: { columns: { name: string; statuses: { id: string }[] }[] };
  /** Kanban board sub-filter — applied to the display, not the issue endpoint. */
  subQuery?: { query?: string };
}

interface AgileIssuePage {
  issues: {
    id: string;
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
  const raw = kvGet<BoardCache>(CACHE_KEY);
  return raw && applyLocalMoves(raw);
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
          id: i.id,
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

    return publish({
      boardName: board.name,
      columns,
      issues: boardIssues,
      myAccountId: me.accountId,
      at: Date.now(),
    });
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

export interface JiraIssueHit {
  key: string;
  summary: string;
  status: string;
  type: string;
  assignee: string | null;
  priority: string | null;
  parent: string | null;
  updated: string;
  description: string;
}

interface SearchPage {
  issues: {
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      issuetype: { name: string };
      assignee: { displayName: string } | null;
      priority: { name: string } | null;
      parent?: { key: string };
      updated: string;
      description?: unknown;
    };
  }[];
}

/** Flattens Atlassian Document Format to plain text; the agent only needs to read it. */
function adfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(adfText).join(n.type === "paragraph" || n.type === "listItem" ? "" : "\n");
  return n.type === "paragraph" || n.type === "heading" ? `${inner}\n` : inner;
}

/** Issues beyond the board mirror, for backlog grooming and epic planning. */
export async function searchIssues(jql: string, max = 25): Promise<JiraIssueHit[]> {
  const page = await request<SearchPage>("/rest/api/3/search/jql", {
    jql,
    maxResults: Math.min(Math.max(max, 1), 50),
    fields: ["summary", "status", "issuetype", "assignee", "priority", "parent", "updated", "description"],
  });
  return page.issues.map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status.name,
    type: i.fields.issuetype.name,
    assignee: i.fields.assignee?.displayName ?? null,
    priority: i.fields.priority?.name ?? null,
    parent: i.fields.parent?.key ?? null,
    updated: i.fields.updated,
    description: adfText(i.fields.description).trim().slice(0, 1500),
  }));
}

export interface NewIssue {
  project: string;
  type: string;
  summary: string;
  description?: string;
  /** Epic (or other parent) key the issue belongs under. */
  parent?: string;
}

export async function createIssue(issue: NewIssue): Promise<{ key: string; url: string }> {
  const fields: Record<string, unknown> = {
    project: { key: issue.project },
    issuetype: { name: issue.type },
    summary: issue.summary,
  };
  if (issue.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: issue.description.split(/\n{2,}/).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
    };
  }
  if (issue.parent) fields.parent = { key: issue.parent };
  const created = await request<{ key: string }>("/rest/api/3/issue", { fields });
  return { key: created.key, url: `${config().baseUrl.replace(/\/$/, "")}/browse/${created.key}` };
}
