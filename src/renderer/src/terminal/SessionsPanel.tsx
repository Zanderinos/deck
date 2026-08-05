import { useEffect, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";

const statusDot: Record<AgentSession["status"], string> = {
  working: "bg-accent animate-pulse",
  needs_input: "bg-yellow-400",
  idle: "bg-green-500",
  ended: "bg-edge",
};

function project(cwd: string): string {
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export interface SessionsPanelProps {
  openTermIds: string[];
  onFocusTerm: (termId: string) => void;
  onResume: (session: AgentSession) => void;
}

export function SessionsPanel({ openTermIds, onFocusTerm, onResume }: SessionsPanelProps) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [hooksReady, setHooksReady] = useState(true);

  useEffect(() => {
    void window.deck.sessions.list().then(setSessions);
    void window.deck.sessions.hooksInstalled().then(setHooksReady);
    return window.deck.sessions.onChanged(setSessions);
  }, []);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-panel">
      {/* pl clears the macOS traffic lights, which overlay this corner. */}
      <div className="flex h-9 shrink-0 items-center pl-9 pr-3 text-xs font-medium text-dim drag-region">
        Agent sessions
      </div>
      {!hooksReady && (
        <button
          onClick={async () => {
            await window.deck.sessions.installHooks();
            setHooksReady(true);
          }}
          className="mx-2 mb-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
        >
          Install Claude Code hooks so deck can track sessions →
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {sessions.length === 0 && (
          <div className="px-2 pt-2 text-xs text-dim/60">
            Run <span className="font-mono">claude</span> in a tab — sessions show up here.
          </div>
        )}
        {sessions.map((s) => {
          const open = s.term_id != null && openTermIds.includes(s.term_id);
          return (
            <button
              key={s.claude_session_id}
              onClick={() => (open ? onFocusTerm(s.term_id!) : onResume(s))}
              title={open ? "Focus tab" : "Resume in a new tab"}
              className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-edge/60"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[s.status]}`} />
              <span className="min-w-0">
                <span className="block truncate text-xs text-ink">
                  {s.title ?? project(s.cwd)}
                </span>
                <span className="block truncate text-[10px] text-dim">
                  {project(s.cwd)} · {ago(s.updated_at)}
                  {s.status === "needs_input" ? " · needs input" : ""}
                  {!open && s.status !== "ended" ? "" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
