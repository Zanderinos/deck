import { useCallback, useEffect, useState } from "react";
import type { InboxPr } from "../../../main/prInbox.js";
import type { AgentSession } from "../../../main/sessions.js";
import { agentLabels } from "../../../shared/agents.js";
import { Icon } from "../board/icons.js";
import { usePrInbox } from "../lib/useInbox.js";
import { useAgentSessions } from "../lib/useSessions.js";
import { useTabs } from "../store.js";
import { AgentChat, type ChatTurn } from "./AgentChat.js";
import { useAgentChoice } from "./AgentSelect.js";
import { isWaiting, prProblems, project } from "./attention.js";

// The agent page: deck's orchestrator front and centre (like Linear's Agent
// view), with a rail of what needs the user — waiting sessions, PRs with
// problems, review requests — and every live session.

const statusRow: Record<AgentSession["status"], { dot: string; color: string; label: string }> = {
  working: { dot: "◐", color: "text-blue", label: "running" },
  needs_input: { dot: "●", color: "text-orange", label: "needs input" },
  needs_review: { dot: "◆", color: "text-orange", label: "needs review" },
  idle: { dot: "✓", color: "text-green", label: "idle" },
  ended: { dot: "✓", color: "text-dim", label: "done" },
};

function ago(iso: string | number): string {
  const m = Math.round((Date.now() - (typeof iso === "number" ? iso : Date.parse(iso))) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return m < 60 * 24 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

function PrRow({ pr, problems }: { pr: InboxPr; problems?: string[] }) {
  return (
    <a href={pr.url} target="_blank" rel="noreferrer" className="flex flex-col gap-0.5 rounded-lg border border-edge2 bg-card px-3 py-2 hover:border-edge3">
      <span className="truncate text-[11px] text-ink" title={pr.title}>{pr.isDraft ? "Draft: " : ""}{pr.title}</span>
      <span className="truncate text-[10px] text-dim">{pr.repo.split("/").pop()} #{pr.number}{pr.author ? ` · ${pr.author}` : ""} · {ago(pr.updatedAt)}</span>
      {problems && problems.length > 0 && <span className="text-[10px] text-orange">{problems.join(" · ")}</span>}
    </a>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 px-4 py-3">
      <h3 className="flex items-center gap-2 text-[10px] tracking-widest text-dim">{title.toUpperCase()}<span className="text-mut">{count}</span></h3>
      {children}
    </section>
  );
}

export function AgentPage({ visible }: { visible: boolean }) {
  const { newTab, tabs, focusTab } = useTabs();
  const sessions = useAgentSessions();
  const inbox = usePrInbox();
  const [agent, setAgent] = useAgentChoice();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [rail, setRail] = useState(() => localStorage.getItem("deck.agent.rail") !== "hidden");
  const [defaultView, setDefaultView] = useState<string>();
  useEffect(() => { void window.deck.getSettings().then((s) => setDefaultView(s.defaultView)); }, []);

  const onTurns = useCallback((update: (turns: ChatTurn[]) => ChatTurn[]) => setTurns(update), []);
  const reset = () => { void window.deck.ask.reset(); setTurns([]); };
  const toggleRail = () => setRail((open) => { localStorage.setItem("deck.agent.rail", open ? "hidden" : "visible"); return !open; });

  const live = sessions.filter((s) => s.status !== "ended");
  const waiting = live.filter(isWaiting);
  const troubled = (inbox?.mine ?? []).map((pr) => ({ pr, problems: prProblems(pr) })).filter((p) => p.problems.length > 0);
  const attention = waiting.length + troubled.length;
  const open = new Set(tabs.map((t) => t.termId));
  const openSession = (s: AgentSession) => s.term_id && open.has(s.term_id) ? focusTab(s.term_id) : void newTab({ cwd: s.cwd, agent: s.agent, sessionId: s.session_id });

  return (
    <div className={`${visible ? "flex" : "hidden"} min-h-0 min-w-0 flex-1`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-edge px-6 py-3">
          <Icon name="sparkle" className="text-accent" />
          <span className="font-bold text-ink">Agent</span>
          {turns.length > 0 && <button onClick={reset} className="rounded-md border border-edge2 px-2 py-0.5 text-[11px] text-body hover:text-ink">New chat</button>}
          {defaultView && defaultView !== "agent" && (
            <button onClick={async () => { await window.deck.updateSettings({ defaultView: "agent" }); setDefaultView("agent"); }} className="text-[11px] text-dim hover:text-ink">Make this my default view</button>
          )}
          <span className="ml-auto text-[11px] text-dim">
            {live.filter((s) => s.status === "working").length} running · {attention} need you
          </span>
          <button onClick={toggleRail} aria-pressed={rail} aria-label="Toggle agent rail" title="Sessions and pull requests" className={`rounded p-1 ${rail ? "bg-card2 text-soft" : "text-dim hover:text-ink"}`}><Icon name="sidebar" size={14} /></button>
        </div>
        <AgentChat agent={agent} onAgent={(next) => { setAgent(next); reset(); }} sessions={live} turns={turns} onTurns={onTurns} />
      </div>

      {rail && (
        <section aria-label="Agent rail" className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel">
          {attention > 0 && (
            <Section title="Needs you" count={attention}>
              {waiting.map((s) => (
                <button key={s.session_id} onClick={() => openSession(s)} className="flex flex-col gap-0.5 rounded-lg border border-orange/30 bg-card px-3 py-2 text-left hover:border-orange/60">
                  <span className="truncate text-[11px] text-ink">{s.title ?? project(s.cwd)}</span>
                  <span className="text-[10px] text-orange">{statusRow[s.status].label} · {agentLabels[s.agent]} · {project(s.cwd)}</span>
                  {s.review_note && <span className="line-clamp-2 text-[10px] text-dim">{s.review_note}</span>}
                </button>
              ))}
              {troubled.map(({ pr, problems }) => <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} problems={problems} />)}
            </Section>
          )}
          <Section title="Review requested" count={inbox?.reviewRequested.length ?? 0}>
            {!inbox && <span className="text-[11px] text-dim">Waiting for GitHub…</span>}
            {inbox?.reviewRequested.length === 0 && <span className="text-[11px] text-dim">Nothing waiting on your review.</span>}
            {inbox?.reviewRequested.map((pr) => <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} />)}
          </Section>
          <Section title="My open PRs" count={inbox?.mine.length ?? 0}>
            {inbox?.mine.length === 0 && <span className="text-[11px] text-dim">No open pull requests.</span>}
            {inbox?.mine.filter((pr) => prProblems(pr).length === 0).map((pr) => <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} />)}
          </Section>
          <Section title="Sessions" count={live.length}>
            {live.length === 0 && <span className="text-[11px] text-dim">No agent sessions yet — run <span className="text-soft">claude</span> or <span className="text-soft">codex</span> in a terminal, or ask deck to start one.</span>}
            {live.filter((s) => !isWaiting(s)).map((s) => {
              const r = statusRow[s.status];
              return (
                <button key={s.session_id} onClick={() => openSession(s)} className="flex items-center gap-2.5 rounded-lg border border-edge2 bg-card px-3 py-2 text-left hover:border-edge3">
                  <span className={`w-3 ${r.color}`}>{r.dot}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-ink">{s.title ?? project(s.cwd)}</span>
                    <span className="block text-[10px] text-dim">{agentLabels[s.agent]} · {project(s.cwd)} · {ago(s.updated_at)}</span>
                  </span>
                  <span className={`text-[10px] ${r.color}`}>{r.label}</span>
                </button>
              );
            })}
          </Section>
        </section>
      )}
    </div>
  );
}
