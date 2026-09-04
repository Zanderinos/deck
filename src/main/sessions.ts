import { openDb } from "./db.js";

// Registry of agent (Claude Code) sessions, fed by hook callbacks. Sessions
// started outside deck are tracked too — they just carry no term_id.

export type SessionStatus = "working" | "needs_input" | "needs_review" | "idle" | "ended";

export interface AgentSession {
  claude_session_id: string;
  agent: string;
  cwd: string;
  title: string | null;
  status: SessionStatus;
  term_id: string | null;
  transcript_path: string | null;
  issue_key: string | null;
  /** The agent's decisions summary, set when it asks for review before pushing. */
  review_note: string | null;
  started_at: number;
  updated_at: number;
}

// Terminals spawned from a ticket carry the link until the session's first
// hook arrives and persists it.
const pendingLinks = new Map<string, string>();

export function linkTermToIssue(termId: string, issueKey: string): void {
  pendingLinks.set(termId, issueKey);
}

/** The deck-review skill posts here when the agent pauses for user
 *  verification before pushing: the tab flips to needs_review and carries
 *  the agent's decisions summary. */
export function requestReview(termId: string, note: string): void {
  const changed = openDb()
    .prepare(
      "UPDATE agent_sessions SET status = 'needs_review', review_note = ?, updated_at = ? WHERE term_id = ? AND status != 'ended'",
    )
    .run(note, Date.now(), termId).changes;
  if (changed > 0) notify();
}

/** Session rows outlive their terminals; a term_id whose terminal is gone
 *  would mislabel whatever tab later reuses it. */
export function clearTermLinks(liveTermIds: string[]): void {
  const keep = liveTermIds.map(() => "?").join(",") || "''";
  openDb()
    .prepare(`UPDATE agent_sessions SET term_id = NULL WHERE term_id IS NOT NULL AND term_id NOT IN (${keep})`)
    .run(...liveTermIds);
}

const ISSUE_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;

export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  prompt?: string;
}

// Sessions deck itself runs (the "Ask deck" assistant) fire the same hooks
// as any other session; they are excluded so they never appear in the list
// they are describing.
const internalSessions = new Set<string>();

export function markInternalSession(id: string): void {
  internalSessions.add(id);
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
  // A completed tool call is the proof the agent resumed after a permission
  // prompt — without it, needs_input would stick until the next Stop.
  PostToolUse: "working",
  Stop: "idle",
  SessionEnd: "ended",
};

export function applyHook(payload: HookPayload, termId: string | null): void {
  const id = payload.session_id;
  const status = payload.hook_event_name ? eventStatus[payload.hook_event_name] : undefined;
  if (!id || !status || internalSessions.has(id)) return;

  const db = openDb();
  const now = Date.now();
  const linked = termId ? (pendingLinks.get(termId) ?? null) : null;
  // needs_review is set mid-turn (by the deck-review skill), so the same
  // turn's own PostToolUse/Stop events must not downgrade it. It clears when
  // the user replies (UserPromptSubmit) or the session ends.
  db.prepare(
    `INSERT INTO agent_sessions (claude_session_id, cwd, status, term_id, transcript_path, issue_key, started_at, updated_at)
     VALUES (@id, @cwd, @status, @termId, @transcript, @issueKey, @now, @now)
     ON CONFLICT(claude_session_id) DO UPDATE SET
       status = CASE
         WHEN agent_sessions.status = 'needs_review' AND @event IN ('PostToolUse', 'Stop')
           THEN 'needs_review'
         ELSE @status
       END,
       review_note = CASE
         WHEN @event = 'UserPromptSubmit' THEN NULL
         ELSE agent_sessions.review_note
       END,
       updated_at = @now,
       cwd = COALESCE(NULLIF(@cwd, ''), cwd),
       term_id = COALESCE(@termId, term_id),
       transcript_path = COALESCE(@transcript, transcript_path),
       issue_key = COALESCE(agent_sessions.issue_key, @issueKey)`,
  ).run({
    id,
    cwd: payload.cwd ?? "",
    status,
    event: payload.hook_event_name,
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
