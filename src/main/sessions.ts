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
  started_at: number;
  updated_at: number;
}

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
  db.prepare(
    `INSERT INTO agent_sessions (claude_session_id, cwd, status, term_id, transcript_path, started_at, updated_at)
     VALUES (@id, @cwd, @status, @termId, @transcript, @now, @now)
     ON CONFLICT(claude_session_id) DO UPDATE SET
       status = @status,
       updated_at = @now,
       cwd = COALESCE(NULLIF(@cwd, ''), cwd),
       term_id = COALESCE(@termId, term_id),
       transcript_path = COALESCE(@transcript, transcript_path)`,
  ).run({
    id,
    cwd: payload.cwd ?? "",
    status,
    termId,
    transcript: payload.transcript_path ?? null,
    now,
  });

  // The first prompt of a session becomes its title.
  if (payload.hook_event_name === "UserPromptSubmit" && payload.prompt) {
    db.prepare(
      "UPDATE agent_sessions SET title = COALESCE(title, ?) WHERE claude_session_id = ?",
    ).run(payload.prompt.slice(0, 120), id);
  }
  notify();
}
