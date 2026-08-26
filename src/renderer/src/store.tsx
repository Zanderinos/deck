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

export interface TermTab {
  termId: string;
  title: string;
  cwd?: string;
  /** Claude session this tab was opened to resume. */
  sessionId?: string;
}

export interface OpenOptions {
  cwd?: string;
  command?: string;
  issueKey?: string;
  /** Resume this Claude session; a tab already resuming it is focused instead. */
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
}

const Ctx = createContext<TabStore | null>(null);

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [ready, setReady] = useState(false);

  const toTab = (meta: { id: string; cwd: string; command?: string }): TermTab => ({
    termId: meta.id,
    title: meta.command?.split(" ")[0] ?? "shell",
    cwd: meta.cwd,
    sessionId: /--resume (\S+)/.exec(meta.command ?? "")?.[1],
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

  const newTab = useCallback(async (opts: OpenOptions = {}) => {
    const { sessionId, ...create } = opts;
    if (sessionId) {
      const open = tabsRef.current.find((t) => t.sessionId === sessionId);
      if (open) {
        setActiveId(open.termId);
        return;
      }
      if (resuming.current.has(sessionId)) return;
      resuming.current.add(sessionId);
      create.command = `claude --resume ${sessionId}`;
    }
    try {
      const meta = await window.deck.term.create(create);
      setTabs((t) => [...t, toTab(meta)]);
      setActiveId(meta.id);
    } finally {
      if (sessionId) resuming.current.delete(sessionId);
    }
  }, []);

  const closeTab = useCallback((termId: string, kill = true) => {
    if (kill) window.deck.term.kill(termId);
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

  useEffect(() => window.deck.term.onExit((id) => closeTab(id, false)), [closeTab]);

  const store = useMemo<TabStore>(
    () => ({ tabs, activeId, ready, newTab, closeTab, focusTab: setActiveId, setTitle }),
    [tabs, activeId, ready, newTab, closeTab, setTitle],
  );
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTabs(): TabStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTabs outside TabProvider");
  return store;
}
