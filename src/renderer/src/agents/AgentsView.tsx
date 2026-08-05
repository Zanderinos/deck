import { useEffect, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";
import { useTabs } from "../store.js";

const rows: Record<AgentSession["status"], { dot: string; color: string; label: string }> = {
  working: { dot: "◐", color: "text-blue", label: "running" },
  needs_input: { dot: "●", color: "text-orange", label: "needs input" },
  idle: { dot: "✓", color: "text-green", label: "idle" },
  ended: { dot: "✓", color: "text-dim", label: "done" },
};

function project(cwd?: string | null): string {
  return cwd?.split("/").filter(Boolean).pop() ?? "~";
}

function dur(s: AgentSession): string {
  const ms = s.updated_at - s.started_at;
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function AgentsView() {
  const { newTab, tabs, focusTab } = useTabs();
  const [sessions, setSessions] = useState<AgentSession[]>([]);

  useEffect(() => {
    void window.deck.sessions.list().then(setSessions);
    return window.deck.sessions.onChanged(setSessions);
  }, []);

  const counts = sessions.reduce(
    (acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  const open = new Set(tabs.map((t) => t.termId));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 border-b border-edge px-6 py-3.5">
        <span className="font-bold text-ink">Agents</span>
        <span className="text-[11px] text-dim">
          {counts.working ?? 0} running · {counts.needs_input ?? 0} waiting ·{" "}
          {(counts.idle ?? 0) + (counts.ended ?? 0)} done
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
        {sessions.length === 0 && (
          <div className="pt-4 text-xs text-dim">
            No agent sessions yet — run <span className="font-mono text-soft">claude</span> in a
            terminal.
          </div>
        )}
        {sessions.map((s) => {
          const r = rows[s.status];
          return (
            <button
              key={s.claude_session_id}
              onClick={() =>
                s.term_id && open.has(s.term_id)
                  ? focusTab(s.term_id)
                  : void newTab({
                      cwd: s.cwd,
                      command: `claude --resume ${s.claude_session_id}`,
                    })
              }
              className="flex items-center gap-3.5 rounded-lg border border-edge2 bg-card px-4 py-3 text-left hover:border-edge3"
            >
              <span className={`w-3.5 ${r.color}`}>{r.dot}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink">
                  {s.title ?? project(s.cwd)}
                </span>
                <span className="mt-0.5 block text-[10px] text-dim">{project(s.cwd)}</span>
              </span>
              <span className={`w-[90px] text-[11px] ${r.color}`}>{r.label}</span>
              <span className="w-[70px] text-right text-[11px] text-dim">{dur(s)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
