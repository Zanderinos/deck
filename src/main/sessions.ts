import { openDb } from "./db.js";

// Registry of agent (Claude Code) sessions, fed by hook callbacks. Sessions
// started outside deck are tracked too — they just carry no term_id.

export type SessionStatus = "working" | "needs_input" | "idle" | "ended";

export interface AgentSession {
  claude_session_id: string;
  agent: string;
  cwd: string;
  title: string | null;
  status: SessionStatus;
  term_id: string | null;
  transcript_path: string | null;
  issue_key: string | null;
  started_at: number;
  updated_at: number;
}

// Terminals spawned from a ticket carry the link until the session's first
// hook arrives and persists it.
const pendingLinks = new Map<string, string>();

export function linkTermToIssue(termId: string, issueKey: string): void {
  pendingLinks.set(termId, issueKey);
}

const ISSUE_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;

export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  prompt?: string;
}

const listeners = new Set<() => void>();

export function onSessionsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function removeSession(id: string): void {
  openDb().prepare("DELETE FROM agent_sessions WHERE claude_session_id = ?").run(id);
  notify();
}

export function listSessions(limit = 100): AgentSession[] {
  return openDb()
    .prepare("SELECT * FROM agent_sessions ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as AgentSession[];
}

const eventStatus: Record<string, SessionStatus> = {
  SessionStart: "idle",
  UserPromptSubmit: "working",
  Notification: "needs_input",
  Stop: "idle",
  SessionEnd: "ended",
};

export function applyHook(payload: HookPayload, termId: string | null): void {
  const id = payload.session_id;
  const status = payload.hook_event_name ? eventStatus[payload.hook_event_name] : undefined;
  if (!id || !status) return;

  const db = openDb();
  const now = Date.now();
  const linked = termId ? (pendingLinks.get(termId) ?? null) : null;
  db.prepare(
    `INSERT INTO agent_sessions (claude_session_id, cwd, status, term_id, transcript_path, issue_key, started_at, updated_at)
     VALUES (@id, @cwd, @status, @termId, @transcript, @issueKey, @now, @now)
     ON CONFLICT(claude_session_id) DO UPDATE SET
       status = @status,
       updated_at = @now,
       cwd = COALESCE(NULLIF(@cwd, ''), cwd),
       term_id = COALESCE(@termId, term_id),
       transcript_path = COALESCE(@transcript, transcript_path),
       issue_key = COALESCE(agent_sessions.issue_key, @issueKey)`,
  ).run({
    id,
    cwd: payload.cwd ?? "",
    status,
    termId,
    transcript: payload.transcript_path ?? null,
    issueKey: linked,
    now,
  });

  // One live session per terminal: a new session id in the same deck tab
  // supersedes whatever ran there before (e.g. `claude --resume` forks a new
  // session id and would otherwise leave the old row dangling forever).
  if (termId) {
    db.prepare(
      "UPDATE agent_sessions SET status = 'ended', updated_at = ? WHERE term_id = ? AND claude_session_id != ?",
    ).run(now, termId, id);
  }

  // The first prompt of a session becomes its title, and an issue key
  // mentioned in it links the session to that ticket.
  if (payload.hook_event_name === "UserPromptSubmit" && payload.prompt) {
    db.prepare(
      "UPDATE agent_sessions SET title = COALESCE(title, ?) WHERE claude_session_id = ?",
    ).run(payload.prompt.slice(0, 120), id);
    const key = ISSUE_KEY_RE.exec(payload.prompt)?.[0];
    if (key) {
      db.prepare(
        "UPDATE agent_sessions SET issue_key = COALESCE(issue_key, ?) WHERE claude_session_id = ?",
      ).run(key, id);
    }
  }
  notify();
}
