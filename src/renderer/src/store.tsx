import { sessionAgent, sessionKey, type AgentLaunch } from "../../shared/agents.js";
import type { TermMeta } from "../../main/pty.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Terminal tabs live at app level so the sidebar, search overlay and
// terminal view all share them.

export interface TermTab extends AgentLaunch {
  termId: string;
  title: string;
  cwd?: string;
  customTitle?: string;
  /** agent session this tab was opened to resume. */
  sessionId?: string;
}

export interface OpenOptions extends AgentLaunch {
  cwd?: string;
  command?: string;
  issueKey?: string;
  /** Resume this agent session; a tab already resuming it is focused instead. */
  sessionId?: string;
}

interface TabStore {
  tabs: TermTab[];
  activeId?: string;
  /** False until terminals surviving from before the reload are restored. */
  ready: boolean;
  newTab: (opts?: OpenOptions) => Promise<void>;
  closeTab: (termId: string, kill?: boolean) => void;
  focusTab: (termId: string) => void;
  setTitle: (termId: string, title: string) => void;
  renameTab: (termId: string, title: string) => void;
}

const Ctx = createContext<TabStore | null>(null);

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [ready, setReady] = useState(false);

  const toTab = (meta: TermMeta): TermTab => ({
    termId: meta.id,
    title: meta.agent ?? meta.command?.split(" ")[0] ?? "shell",
    cwd: meta.cwd,
    customTitle: localStorage.getItem(`deck.tab.name.${meta.id}`) ?? undefined,
    agent: meta.agent ?? (/^codex(?:\s|$)/.test(meta.command ?? "") ? "codex" : /^claude(?:\s|$)/.test(meta.command ?? "") ? "claude" : undefined),
    sessionId: meta.sessionId ?? (meta.command?.startsWith("codex resume ") ? sessionKey("codex", /codex resume ['"]?([^\s'"]+)/.exec(meta.command)?.[1] ?? "") : undefined) ?? /--resume ['"]?([^\s'"]+)/.exec(meta.command ?? "")?.[1],
  });

  // Callbacks read the live tab list, and a session being resumed is held
  // here until its tab exists so a double click can't open it twice.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const resuming = useRef(new Set<string>());

  // Terminals live in the pty host, so a reload (or a restarted main
  // process) finds the previous tabs still running.
  useEffect(() => {
    void window.deck.term.list().then((terms) => {
      setTabs(terms.map(toTab));
      setActiveId(terms.at(-1)?.id);
      setReady(true);
    });
  }, []);

  useEffect(() => window.deck.sessions.onChanged((sessions) => {
    setTabs((tabs) => tabs.map((tab) => {
      const session = sessions.find((session) => session.term_id === tab.termId && session.status !== "ended" && !session.session_id.startsWith("pending:"));
      return session ? { ...tab, sessionId: session.session_id, agent: session.agent, cwd: session.cwd || tab.cwd } : tab;
    }));
  }), []);

  const newTab = useCallback(async (opts: OpenOptions = {}) => {
    const agent = opts.agent ?? (opts.sessionId ? sessionAgent(opts.sessionId) : undefined);
    const sessionId = opts.sessionId ? sessionKey(agent!, opts.sessionId) : undefined;
    const create = { ...opts, agent, sessionId };
    if (sessionId && resuming.current.has(sessionId)) return;
    if (sessionId) resuming.current.add(sessionId);
    try {
      if (sessionId) {
        const sessions = await window.deck.sessions.list();
        const session = sessions.find((session) => session.session_id === sessionId);
        const open = tabsRef.current.find((tab) => tab.sessionId === sessionId);
        if (open && session?.status !== "ended") { setActiveId(open.termId); return; }
        const live = session?.status !== "ended" && tabsRef.current.find((tab) => tab.termId === session?.term_id);
        if (live) { setActiveId(live.termId); return; }
      }
      const meta = await window.deck.term.create(create);
      setTabs((tabs) => tabs.some((tab) => tab.termId === meta.id) ? tabs : [...tabs, toTab(meta)]);
      setActiveId(meta.id);
    } finally {
      if (sessionId) resuming.current.delete(sessionId);
    }
  }, []);

  useEffect(() => window.deck.term.onCreated((meta) => {
    setTabs((tabs) => tabs.some((tab) => tab.termId === meta.id) ? tabs : [...tabs, toTab(meta)]);
  }), []);

  const closeTab = useCallback((termId: string, kill = true) => {
    if (kill) window.deck.term.kill(termId);
    localStorage.removeItem(`deck.tab.name.${termId}`);
    setTabs((tabs) => {
      const i = tabs.findIndex((t) => t.termId === termId);
      const next = tabs.filter((t) => t.termId !== termId);
      setActiveId((active) =>
        active === termId ? next[Math.min(i, next.length - 1)]?.termId : active,
      );
      return next;
    });
  }, []);

  const setTitle = useCallback((termId: string, title: string) => {
    setTabs((tabs) => tabs.map((t) => (t.termId === termId ? { ...t, title } : t)));
  }, []);

  const renameTab = useCallback((termId: string, title: string) => {
    localStorage.setItem(`deck.tab.name.${termId}`, title.trim());
    setTabs((tabs) => tabs.map((tab) => tab.termId === termId ? { ...tab, customTitle: title.trim() || undefined } : tab));
  }, []);

  useEffect(() => window.deck.term.onExit((id) => closeTab(id, false)), [closeTab]);

  const store = useMemo<TabStore>(
    () => ({ tabs, activeId, ready, newTab, closeTab, focusTab: setActiveId, setTitle, renameTab }),
    [tabs, activeId, ready, newTab, closeTab, setTitle, renameTab],
  );
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTabs(): TabStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTabs outside TabProvider");
  return store;
}
