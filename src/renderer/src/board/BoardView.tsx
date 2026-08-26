import { useEffect, useMemo, useRef, useState } from "react";
import type { IssuePr } from "../../../main/github.js";
import type { BoardCache, BoardIssue } from "../../../main/jira.js";
import type { DeckSettings } from "../../../shared/settings.js";
import { onNavBack } from "../lib/bus.js";
import { useTabs } from "../store.js";
import { DiffScreen } from "./DiffScreen.js";
import { IssuePanel } from "./IssuePanel.js";

const columnDots = ["text-body", "text-orange", "text-blue", "text-green", "text-accent"];
const COLLAPSED_KEY = "deck.board.collapsedColumns";

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
const avatarColors = ["#f87171", "#4ade80", "#38bdf8", "#a78bfa", "#fb923c", "#7dcfff"];

function initials(name: string | null): string {
  if (!name) return "·";
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function avatarColor(name: string | null): string {
  if (!name) return "#23252d";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return avatarColors[h % avatarColors.length];
}

export function BoardView() {
  const { newTab } = useTabs();
  const [board, setBoard] = useState<BoardCache>();
  const [settings, setSettings] = useState<DeckSettings>();
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<BoardIssue>();
  const [diffPr, setDiffPr] = useState<IssuePr>();
  const [mineOnly, setMineOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [dragKey, setDragKey] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [moveError, setMoveError] = useState<string>();

  const toggleCollapsed = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
    void window.deck.board.get().then(setBoard);
    return window.deck.board.onChanged(setBoard);
  }, []);

  // Mouse-back closes the top overlay before the view history moves. Refs
  // mirror the state because the dispatch needs a synchronous answer.
  const overlayRef = useRef({ diff: false, panel: false });
  overlayRef.current = { diff: Boolean(diffPr), panel: Boolean(selected) };
  useEffect(
    () =>
      onNavBack((e) => {
        if (overlayRef.current.diff) {
          e.preventDefault();
          setDiffPr(undefined);
        } else if (overlayRef.current.panel) {
          e.preventDefault();
          setSelected(undefined);
        }
      }),
    [],
  );

  const rejectedRe = useMemo(() => {
    try {
      return new RegExp(settings?.jira.rejectedPattern || "reject", "i");
    } catch {
      return /reject/i;
    }
  }, [settings]);

  const configured = Boolean(settings && settings.jira.baseUrl && settings.jira.boardId);

  // Older caches have no account id, so "mine" can only be honoured once a
  // sync has recorded who we are.
  const canFilterMine = Boolean(board?.myAccountId);
  const issues = useMemo(() => {
    if (!board) return [];
    if (!mineOnly || !board.myAccountId) return board.issues;
    return board.issues.filter((i) => i.assigneeId === board.myAccountId);
  }, [board, mineOnly]);

  // Optimistic: the card lands in the column at once; a failed transition
  // puts the real board back and says why.
  const moveTo = async (columnName: string) => {
    const key = dragKey;
    setDragKey(undefined);
    setDropTarget(undefined);
    const column = board?.columns.find((c) => c.name === columnName);
    const issue = board?.issues.find((i) => i.key === key);
    if (!board || !column || !issue || column.statusIds.includes(issue.statusId)) return;
    const before = board;
    setBoard({
      ...board,
      issues: board.issues.map((i) =>
        i.key === key ? { ...i, statusId: column.statusIds[0], statusName: columnName } : i,
      ),
    });
    setMoveError(undefined);
    try {
      setBoard(await window.deck.board.move(issue.key, columnName));
    } catch (err) {
      setBoard(before);
      setMoveError(err instanceof Error ? err.message.replace(/^Error invoking.*?: /, "") : String(err));
    }
  };

  const dropProps = (columnName: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragKey) return;
      e.preventDefault();
      if (dropTarget !== columnName) setDropTarget(columnName);
    },
    onDragLeave: () => setDropTarget((t) => (t === columnName ? undefined : t)),
    onDrop: () => void moveTo(columnName),
  });

  const spinUp = (issue: BoardIssue) => {
    const prompt = `${issue.key}: ${issue.summary} — the code was rejected in review. Look at the PR feedback and address it.`;
    void newTab({ command: `claude ${JSON.stringify(prompt)}`, issueKey: issue.key });
  };

  if (!configured) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header title="Board" sub="not configured" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-dim">
          <div>Fill in Jira base URL, email, API token and board id in Settings.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Header
        title="Board"
        sub={board ? `${board.boardName} · ${issues.length} issues` : "syncing…"}
        right={
          <div className="flex items-center gap-4">
            {canFilterMine && (
              <button
                onClick={() => setMineOnly((v) => !v)}
                className={`text-[11px] ${mineOnly ? "text-accent" : "text-dim hover:text-ink"}`}
                title="Show only issues assigned to me"
              >
                {mineOnly ? "● my tasks" : "○ my tasks"}
              </button>
            )}
            <button
              onClick={async () => {
                setSyncing(true);
                setBoard((await window.deck.board.sync()) ?? board);
                setSyncing(false);
              }}
              className="text-[11px] text-dim hover:text-ink"
            >
              {syncing ? "syncing…" : "↻ sync"}
            </button>
          </div>
        }
      />
      {moveError && (
        <div className="flex items-center gap-3 border-b border-red/30 bg-red/10 px-6 py-1.5 text-[11px] text-red">
          <span className="min-w-0 flex-1 truncate">{moveError}</span>
          <button onClick={() => setMoveError(undefined)} className="hover:text-ink">
            ✕
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
      <div className="flex flex-1 items-start gap-4 overflow-auto px-6 py-5">
        {board?.columns.map((col, ci) => {
          const cards = issues.filter((i) => col.statusIds.includes(i.statusId));
          const dot = columnDots[ci % columnDots.length];
          const isTarget = dropTarget === col.name;
          if (collapsed.has(col.name)) {
            // Jira-style collapsed column: a narrow strip with the title
            // running down it; click anywhere to expand.
            return (
              <button
                key={col.name}
                onClick={() => toggleCollapsed(col.name)}
                title={`Expand ${col.name}`}
                {...dropProps(col.name)}
                className={`flex w-9 shrink-0 flex-col items-center gap-2 rounded-lg border bg-card py-2.5 hover:border-edge3 ${
                  isTarget ? "border-accent" : "border-edge2"
                }`}
              >
                <span className={`text-[10px] ${dot}`}>●</span>
                <span
                  className="whitespace-nowrap text-xs font-bold text-ink"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {col.name}
                </span>
                <span className="text-[11px] text-dim">{cards.length}</span>
              </button>
            );
          }
          return (
            <div
              key={col.name}
              {...dropProps(col.name)}
              className={`group w-[280px] shrink-0 self-stretch rounded-lg ${
                isTarget ? "bg-accent/5 ring-1 ring-accent/40" : ""
              }`}
            >
              <div className="flex items-center gap-2 px-1 pb-2.5">
                <span className={`text-[10px] ${dot}`}>●</span>
                <span className="text-xs font-bold text-ink">{col.name}</span>
                <span className="text-[11px] text-dim">{cards.length}</span>
                <button
                  onClick={() => toggleCollapsed(col.name)}
                  title="Collapse"
                  className="ml-auto text-[11px] text-dim opacity-0 hover:text-ink group-hover:opacity-100"
                >
                  →←
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {cards.map((card) => {
                  const rejected = rejectedRe.test(card.statusName);
                  return (
                    <div
                      key={card.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragKey(card.key);
                      }}
                      onDragEnd={() => {
                        setDragKey(undefined);
                        setDropTarget(undefined);
                      }}
                      onClick={() => setSelected(card)}
                      className={`cursor-pointer rounded-lg border bg-card p-3 hover:border-edge3 ${
                        selected?.key === card.key ? "border-accent/50" : "border-edge2"
                      } ${dragKey === card.key ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-dim">{card.key}</span>
                        <span
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-bg"
                          style={{ background: avatarColor(card.assignee) }}
                          title={card.assignee ?? "unassigned"}
                        >
                          {initials(card.assignee)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs leading-[1.45] text-soft">{card.summary}</div>
                      {rejected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            spinUp(card);
                          }}
                          className="mt-2 text-[10px] text-red hover:underline"
                        >
                          ✗ code rejected — ⏎ spin up claude
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {selected && settings && (
        <IssuePanel
          issue={selected}
          jiraBaseUrl={settings.jira.baseUrl}
          rejected={rejectedRe.test(selected.statusName)}
          onClose={() => setSelected(undefined)}
          onOpenDiff={setDiffPr}
        />
      )}
      </div>
      {diffPr && <DiffScreen pr={diffPr} onClose={() => setDiffPr(undefined)} />}
    </div>
  );
}

function Header({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-edge px-6 py-3.5">
      <span className="font-bold text-ink">{title}</span>
      <span className="text-[11px] text-dim">{sub}</span>
      <span className="ml-auto">{right}</span>
    </div>
  );
}
