import { useEffect, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";
import { useTabs } from "../store.js";
import type { View } from "../App.js";

const navDefs: { icon: string; label: string; key: string; v: View; iconColor: string }[] = [
  { icon: "❯", label: "terminal", key: "⌘1", v: "terminal", iconColor: "text-green" },
  { icon: "◫", label: "board", key: "⌘2", v: "board", iconColor: "text-orange" },
  { icon: "✳", label: "agents", key: "⌘3", v: "agents", iconColor: "text-accent" },
];

const statusGlyph: Record<AgentSession["status"], { dot: string; color: string }> = {
  working: { dot: "✳", color: "text-accent" },
  needs_input: { dot: "✳", color: "text-orange" },
  idle: { dot: "·", color: "text-blue" },
  ended: { dot: "❯", color: "text-dim" },
};

function project(cwd?: string | null): string {
  return cwd?.split("/").filter(Boolean).pop() ?? "~";
}

export function Sidebar({ view, onView }: { view: View; onView: (v: View) => void }) {
  const { tabs, activeId, newTab, focusTab } = useTabs();
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [hooksReady, setHooksReady] = useState(true);

  useEffect(() => {
    void window.deck.sessions.list().then(setAgentSessions);
    void window.deck.sessions.hooksInstalled().then(setHooksReady);
    return window.deck.sessions.onChanged(setAgentSessions);
  }, []);

  const byTerm = new Map(agentSessions.filter((s) => s.term_id).map((s) => [s.term_id!, s]));
  const openTermIds = new Set(tabs.map((t) => t.termId));
  const recent = agentSessions
    .filter((s) => (s.term_id == null || !openTermIds.has(s.term_id)) && s.status !== "ended")
    .slice(0, 12);

  return (
    <div className="flex w-[236px] shrink-0 flex-col border-r border-edge bg-panel">
      <div className="flex flex-col gap-px p-2.5 pb-1">
        {navDefs.map((n) => (
          <button
            key={n.v}
            onClick={() => onView(n.v)}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-card2 ${
              view === n.v ? "bg-card2 text-ink" : "text-body"
            }`}
          >
            <span className={`w-3.5 text-center ${n.iconColor}`}>{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            <span className="text-[10px] text-dim">{n.key}</span>
          </button>
        ))}
      </div>

      <div className="px-4 pb-1.5 pt-3.5 text-[10px] tracking-widest text-dim">SESSIONS</div>
      {!hooksReady && (
        <button
          onClick={async () => {
            await window.deck.sessions.installHooks();
            setHooksReady(true);
          }}
          className="mx-2.5 mb-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-left text-[11px] text-accent hover:bg-accent/20"
        >
          Install Claude Code hooks →
        </button>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {tabs.map((tab) => {
          const s = byTerm.get(tab.termId);
          const glyph = s ? statusGlyph[s.status] : { dot: "❯", color: "text-dim" };
          const active = tab.termId === activeId;
          return (
            <button
              key={tab.termId}
              onClick={() => {
                focusTab(tab.termId);
                onView("terminal");
              }}
              className={`flex gap-2.5 rounded-md border px-2.5 py-2 text-left hover:bg-card2 ${
                active ? "border-edge3 bg-card2" : "border-transparent"
              }`}
            >
              <span className={`text-[11px] leading-[18px] ${glyph.color}`}>{glyph.dot}</span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-xs ${active ? "text-ink" : "text-body"}`}
                >
                  {s?.title ?? tab.title}
                </span>
                <span className="block truncate text-[10px] text-dim">
                  {project(s?.cwd ?? tab.cwd)}
                  {s?.status === "needs_input" ? " · needs input" : ""}
                </span>
              </span>
            </button>
          );
        })}
        {recent.map((s) => {
          const glyph = statusGlyph[s.status];
          return (
            <div
              key={s.claude_session_id}
              onClick={() => {
                void newTab({
                  cwd: s.cwd,
                  command: `claude --resume ${s.claude_session_id}`,
                  issueKey: s.issue_key ?? undefined,
                });
                onView("terminal");
              }}
              title="Resume in a new session"
              className="group flex cursor-pointer gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left hover:bg-card2"
            >
              <span className={`text-[11px] leading-[18px] ${glyph.color}`}>{glyph.dot}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-body">
                  {s.title ?? project(s.cwd)}
                </span>
                <span className="block truncate text-[10px] text-dim">
                  {s.issue_key ? `${s.issue_key} · ` : ""}
                  {project(s.cwd)}
                  {s.status === "needs_input" ? " · needs input" : ""}
                </span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void window.deck.sessions.remove(s.claude_session_id);
                }}
                title="Remove from list"
                className="hidden self-start text-dim hover:text-ink group-hover:block"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-edge p-2.5 text-[11px] text-dim">
        <button onClick={() => void newTab()} className="hover:text-ink">
          + new session
        </button>
        <button
          onClick={() => onView("settings")}
          className={`ml-auto hover:text-ink ${view === "settings" ? "text-ink" : ""}`}
          title="Settings"
        >
          ⚙
        </button>
        <span>⌘T</span>
      </div>
    </div>
  );
}
