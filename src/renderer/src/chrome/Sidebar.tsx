import { useEffect, useRef, useState } from "react";
import { agentLabels, type Agent } from "../../../shared/agents.js";
import type { AgentSession } from "../../../main/sessions.js";
import { useAgentSessions } from "../lib/useSessions.js";
import { shortPath, useGitSummary } from "../lib/useGitSummary.js";
import { useTabs, type TermTab } from "../store.js";
import { Icon } from "../board/icons.js";
import { useSessionSuggestions } from "./useSessionSuggestions.js";
import type { View } from "../App.js";

const statusLabels: Record<AgentSession["status"], string> = {
  working: "Working", needs_input: "Needs input", needs_review: "Needs review", idle: "Ready", ended: "Ended",
};
const statusColors: Record<AgentSession["status"], string> = {
  working: "bg-accent animate-pulse", needs_input: "bg-orange", needs_review: "bg-orange", idle: "bg-green", ended: "bg-dim",
};

function SessionIcon({ agent, status }: { agent?: Agent; status?: AgentSession["status"] }) {
  return <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card2 text-soft">
    {agent === "codex" ? <span className="text-lg leading-none">◎</span> : <Icon name={agent === "claude" ? "sparkle" : "terminal"} size={16} />}
    {status && <span title={statusLabels[status]} className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${statusColors[status]}`} />}
  </span>;
}

function SessionRow({ tab, session, index, onOpen }: { tab: TermTab; session?: AgentSession; index: number; onOpen: () => void }) {
  const { activeId, closeTab, renameTab } = useTabs();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const cwd = session?.cwd || tab.cwd;
  const git = useGitSummary(cwd);
  const agent = session?.agent ?? tab.agent;
  const title = tab.customTitle || session?.title || (tab.title === "shell" ? cwd?.split("/").pop() : tab.title) || "Terminal";
  const active = activeId === tab.termId;
  const waiting = session && ["needs_input", "needs_review"].includes(session.status);
  return <div className="border-b border-edge/80 px-2 py-2">
    <div role="button" tabIndex={0} aria-label={`${title}${agent ? ` (${agentLabels[agent]})` : ""}`} aria-current={active ? "page" : undefined}
      onClick={onOpen} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") onOpen(); }}
      onDoubleClick={() => { setName(title); setRenaming(true); }}
      className={`group flex min-h-[56px] cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 outline-none focus-visible:border-mut ${active ? "border-edge3 bg-card2" : "border-transparent hover:bg-card"}`}>
      <SessionIcon agent={agent} status={session?.status} />
      <div className="min-w-0 flex-1">
        {renaming ? <input aria-label="Session name" autoFocus value={name} onChange={(event) => setName(event.target.value)}
          onClick={(event) => event.stopPropagation()} onBlur={() => { renameTab(tab.termId, name); setRenaming(false); }}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") { renameTab(tab.termId, name); setRenaming(false); } if (event.key === "Escape") setRenaming(false); }}
          className="w-full rounded bg-bg px-1 text-xs text-ink outline-none" /> :
          <div className="truncate text-[12px] text-soft" title={title}>{title}</div>}
        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-mut">
          {git ? <><Icon name="branch" size={10} /><span className="truncate">{git.branch}</span></> : <span className="truncate">{shortPath(cwd)}</span>}
          {agent && <span className="ml-auto shrink-0 text-dim">{agentLabels[agent]}</span>}
        </div>
        {waiting && <div className="mt-1 flex items-center gap-1.5 text-[10px] text-orange"><span className="h-1 w-1 rounded-full bg-orange" />{statusLabels[session.status]}</div>}
      </div>
      <span className="self-start pt-0.5 text-[10px] text-dim group-hover:hidden">{index < 9 ? `⌘${index + 1}` : ""}</span>
      <button aria-label={`Close ${title}`} title="Close session" className="hidden self-start text-mut hover:text-ink group-hover:block"
        onClick={(event) => { event.stopPropagation(); closeTab(tab.termId); }}><Icon name="x" size={11} /></button>
    </div>
  </div>;
}

export function Sidebar({ view, onView }: { view: View; onView: (view: View) => void }) {
  const { tabs, newTab, focusTab, closeTab } = useTabs();
  const sessions = useAgentSessions();
  const { suggestions, dismissSessions } = useSessionSuggestions(sessions);
  const [showMore, setShowMore] = useState(false);
  const [width, setWidth] = useState(() => Math.min(380, Math.max(220, Number(localStorage.getItem("deck.sidebar.width")) || 252)));
  const resizing = useRef<{ x: number; width: number }>();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [hooks, setHooks] = useState<Record<Agent, boolean>>({ claude: true, codex: true });
  const [setup, setSetup] = useState<Agent>();
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const agent of ["claude", "codex"] as const) void window.deck.sessions.hooksInstalled(agent).then((ready) => setHooks((prev) => ({ ...prev, [agent]: ready })));
  }, []);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", dismiss);
    return () => window.removeEventListener("mousedown", dismiss);
  }, [menu]);
  const byTerm = new Map(sessions.filter((session) => session.term_id && session.status !== "ended").reverse().map((session) => [session.term_id, session]));
  const openIds = new Set(tabs.map((tab) => tab.termId));
  const openSessions = new Set(tabs.map((tab) => tab.sessionId));
  const matches = (text: string, status?: string) => text.toLowerCase().includes(query.trim().toLowerCase()) && (filter === "all" || status === "needs_input" || status === "needs_review");
  const visibleTabs = tabs.filter((tab) => {
    const session = byTerm.get(tab.termId);
    return matches([tab.customTitle, tab.title, tab.cwd, tab.agent, session?.title, session?.issue_key].join(" "), session?.status);
  });
  const available = (session: AgentSession) => !openIds.has(session.term_id ?? "") && !openSessions.has(session.session_id) && !session.session_id.startsWith("pending:");
  const recent = suggestions.filter((session) => available(session) && matches(`${session.title} ${session.cwd} ${session.agent}`, session.status));
  const searching = query.trim().length > 0;
  const searchResults = searching ? sessions.filter((session) => available(session) && matches(`${session.title} ${session.cwd} ${session.agent} ${session.issue_key ?? ""}`, session.status)) : [];
  const lastSession = recent[0];
  const resume = async (session: AgentSession) => {
    try {
      await newTab({ agent: session.agent, cwd: session.cwd, sessionId: session.session_id, issueKey: session.issue_key ?? undefined });
      onView("terminal");
    } catch (error) { setError(String(error)); }
  };
  const closeAllTabs = () => {
    dismissSessions(sessions.map((session) => session.session_id));
    tabs.forEach((tab) => closeTab(tab.termId));
    setMenu(false);
    setShowMore(false);
  };
  const launch = async (agent?: Agent) => {
    setMenu(false);
    try { await newTab({ agent }); onView("terminal"); }
    catch (error) { setError(String(error)); }
  };
  return <aside style={{ width }} className="relative flex shrink-0 flex-col border-r border-edge bg-panel font-sans">
    <div role="separator" aria-label="Resize sidebar" aria-orientation="vertical" tabIndex={0}
      onDoubleClick={() => { setWidth(252); localStorage.setItem("deck.sidebar.width", "252"); }}
      onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); setWidth((width) => Math.min(380, Math.max(220, width + (event.key === "ArrowRight" ? 10 : -10)))); } }}
      onPointerDown={(event) => { resizing.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (resizing.current) setWidth(Math.min(380, Math.max(220, resizing.current.width + event.clientX - resizing.current.x))); }}
      onPointerUp={() => { resizing.current = undefined; localStorage.setItem("deck.sidebar.width", String(width)); }}
      className="absolute -right-0.5 bottom-0 top-0 z-40 w-1 cursor-col-resize hover:bg-edge3" />
    <div className="relative flex h-10 shrink-0 items-center gap-2 border-b border-edge px-3" ref={menuRef}>
      <Icon name="search" size={12} className="text-mut" />
      <input aria-label="Search tabs" placeholder="Search tabs…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] text-soft outline-none placeholder:text-dim" />
      <button aria-label="Show sessions needing attention" aria-pressed={filter === "attention"} title="Filter: needs attention" onClick={() => setFilter(filter === "all" ? "attention" : "all")} className={filter === "attention" ? "text-orange" : "text-mut hover:text-ink"}><Icon name="settings" size={14} /></button>
      <button aria-label="New session" aria-expanded={menu} title="New session" onClick={() => setMenu(!menu)} className="text-mut hover:text-ink"><Icon name="plus" size={16} /></button>
      {menu && <div className="absolute right-2 top-9 z-50 w-48 rounded-lg border border-edge3 bg-overlay p-1 shadow-xl">
        <button onClick={() => void launch()} className="menu-item"><Icon name="terminal" />New terminal<span className="ml-auto text-dim">⌘T</span></button>
        {(["claude", "codex"] as const).map((agent) => <button key={agent} onClick={() => void launch(agent)} className="menu-item"><Icon name="sparkle" />New {agentLabels[agent]}</button>)}
        <div className="my-1 border-t border-edge2" />
        <button disabled={!tabs.length} onClick={closeAllTabs} className="menu-item disabled:opacity-40"><Icon name="x" />Close all tabs</button>
        <button onClick={() => { setMenu(false); onView("settings"); }} className="menu-item"><Icon name="settings" />Settings</button>
      </div>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {visibleTabs.map((tab) => <SessionRow key={tab.termId} tab={tab} session={byTerm.get(tab.termId)} index={tabs.indexOf(tab)} onOpen={() => { focusTab(tab.termId); onView("terminal"); }} />)}
      {!searching && lastSession && <section aria-label="Session suggestions" className="mx-3 my-3 rounded-lg border border-edge2 bg-card/50 p-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[11px] font-medium text-mut">Continue your last session</span>
          <button aria-label="Dismiss all session suggestions" title="Dismiss all suggestions" onClick={() => { dismissSessions(recent.map((session) => session.session_id)); setShowMore(false); }} className="shrink-0 rounded p-0.5 text-dim hover:bg-card2 hover:text-soft"><Icon name="x" size={11} /></button>
        </div>
        <button aria-label={`Continue ${lastSession.title || agentLabels[lastSession.agent]}`} onClick={() => void resume(lastSession)} className="mt-3 flex w-full min-w-0 items-center gap-2 text-left">
          <SessionIcon agent={lastSession.agent} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs text-soft" title={lastSession.title || lastSession.cwd}>{lastSession.title || lastSession.cwd.split("/").pop()}</span><span className="mt-0.5 block truncate text-[10px] text-dim">{agentLabels[lastSession.agent]} · {Math.floor((Date.now() - lastSession.updated_at) / 60_000) < 1 ? "Just now" : `${Math.floor((Date.now() - lastSession.updated_at) / 60_000)}m ago`}</span></span>
          <span className="text-mut">↗</span>
        </button>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-dim">
          {recent.length > 1 && <button aria-expanded={showMore} onClick={() => setShowMore(!showMore)} className="hover:text-soft">{showMore ? "Show less" : `More recent (${recent.length - 1})`}</button>}
          <button onClick={() => onView("search")} className="ml-auto hover:text-soft">Search history</button>
        </div>
        {showMore && recent.slice(1).map((session) => <div key={session.session_id} className="mt-2 flex items-center gap-2 border-t border-edge pt-2">
          <button onClick={() => void resume(session)} className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] text-body" title={session.title || session.cwd}>{session.title || session.cwd.split("/").pop()}</span><span className="block truncate text-[10px] text-dim">{agentLabels[session.agent]} · {shortPath(session.cwd)}</span></button>
          <button aria-label={`Dismiss ${session.title || agentLabels[session.agent]}`} onClick={() => dismissSessions([session.session_id])} className="text-dim hover:text-soft"><Icon name="x" size={11} /></button>
        </div>)}
      </section>}
      {searchResults.length > 0 && <div className="px-4 pb-1 pt-4 text-[10px] tracking-widest text-dim">OTHER SESSIONS</div>}
      {searchResults.map((session) => <button key={session.session_id} onClick={() => void resume(session)} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-card">
        <SessionIcon agent={session.agent} />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs text-body">{session.title || session.cwd.split("/").pop()}</span><span className="block truncate text-[10px] text-dim">{agentLabels[session.agent]} · {shortPath(session.cwd)}</span></span>
      </button>)}
      {searching && !visibleTabs.length && !searchResults.length && <div className="p-4 text-xs text-dim">No matching sessions</div>}

    </div>
    {error && <div className="px-3 py-2 text-[11px] text-red">{error}</div>}
    {(["claude", "codex"] as const).filter((agent) => !hooks[agent]).map((agent) => <button key={agent} className="flex items-center gap-2 border-t border-edge px-4 py-2 text-left text-[11px] text-mut hover:text-ink" onClick={async () => {
      try { await window.deck.sessions.installHooks(agent); setHooks((prev) => ({ ...prev, [agent]: true })); setSetup(agent); }
      catch (error) { setError(String(error)); }
    }}><Icon name="link" size={11} />Enable {agentLabels[agent]} live status</button>)}
    {setup === "codex" && <div className="flex items-start gap-2 px-4 py-2 text-[11px] text-mut">In Codex, open /hooks and trust Deck’s hooks.<button title="Dismiss" onClick={() => setSetup(undefined)}><Icon name="x" size={11} /></button></div>}
    <div className="flex items-center gap-1 border-t border-edge px-2 py-2">
      {(["terminal", "board", "agents"] as const).map((target) => <button key={target} onClick={() => onView(target)} title={target} className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] ${view === target ? "bg-card2 text-soft" : "text-dim hover:text-body"}`}><Icon name={target === "terminal" ? "terminal" : target === "board" ? "grid" : "sparkle"} size={12} />{target}</button>)}
    </div>
  </aside>;
}
