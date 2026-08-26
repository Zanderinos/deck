import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Terminal tabs live at app level so the sidebar, search overlay and
// terminal view all share them.

export interface TermTab {
  termId: string;
  title: string;
  cwd?: string;
}

export interface OpenOptions {
  cwd?: string;
  command?: string;
  issueKey?: string;
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
  });

  // Terminals live in the pty host, so a reload (or a restarted main
  // process) finds the previous tabs still running.
  useEffect(() => {
    void window.deck.term.list().then((terms) => {
      setTabs(terms.map(toTab));
      setActiveId(terms.at(-1)?.id);
      setReady(true);
    });
  }, []);

  const newTab = useCallback(async (opts?: OpenOptions) => {
    const meta = await window.deck.term.create(opts);
    setTabs((t) => [...t, toTab(meta)]);
    setActiveId(meta.id);
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
