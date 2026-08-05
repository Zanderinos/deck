import { useEffect, useMemo, useState } from "react";
import type { IssuePr } from "../../../main/github.js";
import type { BoardCache, BoardIssue } from "../../../main/jira.js";
import type { DeckSettings } from "../../../shared/settings.js";
import { useTabs } from "../store.js";
import { DiffScreen } from "./DiffScreen.js";
import { IssuePanel } from "./IssuePanel.js";

const columnDots = ["text-body", "text-orange", "text-blue", "text-green", "text-accent"];
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

  useEffect(() => {
    void window.deck.getSettings().then(setSettings);
    void window.deck.board.get().then(setBoard);
    return window.deck.board.onChanged(setBoard);
  }, []);

  const rejectedRe = useMemo(() => {
    try {
      return new RegExp(settings?.jira.rejectedPattern || "reject", "i");
    } catch {
      return /reject/i;
    }
  }, [settings]);

  const configured = Boolean(settings && settings.jira.baseUrl && settings.jira.boardId);

  const spinUp = (issue: BoardIssue) => {
    const prompt = `${issue.key}: ${issue.summary} — the code was rejected in review. Look at the PR feedback and address it.`;
    void newTab({ command: `claude ${JSON.stringify(prompt)}` });
  };

  if (!configured) {
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="Board" sub="not configured" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-dim">
          <div>Fill in Jira base URL, email, API token and board id in Settings.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Header
        title="Board"
        sub={board ? `${board.boardName} · ${board.issues.length} issues` : "syncing…"}
        right={
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
        }
      />
      <div className="flex min-h-0 flex-1">
      <div className="flex flex-1 items-start gap-4 overflow-auto px-6 py-5">
        {board?.columns.map((col, ci) => {
          const cards = board.issues.filter((i) => col.statusIds.includes(i.statusId));
          return (
            <div key={col.name} className="w-[280px] shrink-0">
              <div className="flex items-center gap-2 px-1 pb-2.5">
                <span className={`text-[10px] ${columnDots[ci % columnDots.length]}`}>●</span>
                <span className="text-xs font-bold text-ink">{col.name}</span>
                <span className="text-[11px] text-dim">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {cards.map((card) => {
                  const rejected = rejectedRe.test(card.statusName);
                  return (
                    <div
                      key={card.key}
                      onClick={() => setSelected(card)}
                      className={`cursor-pointer rounded-lg border bg-card p-3 hover:border-edge3 ${
                        selected?.key === card.key ? "border-accent/50" : "border-edge2"
                      }`}
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
