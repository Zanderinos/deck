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
}

interface TabStore {
  tabs: TermTab[];
  activeId?: string;
  newTab: (opts?: OpenOptions) => Promise<void>;
  closeTab: (termId: string, kill?: boolean) => void;
  focusTab: (termId: string) => void;
  setTitle: (termId: string, title: string) => void;
}

const Ctx = createContext<TabStore | null>(null);

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState<string>();

  const newTab = useCallback(async (opts?: OpenOptions) => {
    const termId = await window.deck.term.create(opts);
    setTabs((t) => [...t, { termId, title: opts?.command?.split(" ")[0] ?? "shell", cwd: opts?.cwd }]);
    setActiveId(termId);
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
    () => ({ tabs, activeId, newTab, closeTab, focusTab: setActiveId, setTitle }),
    [tabs, activeId, newTab, closeTab, setTitle],
  );
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTabs(): TabStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTabs outside TabProvider");
  return store;
}
