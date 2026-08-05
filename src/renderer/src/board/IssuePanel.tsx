import { useEffect, useState } from "react";
import type { IssuePr } from "../../../main/github.js";
import type { BoardIssue } from "../../../main/jira.js";
import { useTabs } from "../store.js";

const stateColor: Record<string, string> = {
  OPEN: "text-green",
  MERGED: "text-accent",
  CLOSED: "text-red",
};

export interface IssuePanelProps {
  issue: BoardIssue;
  jiraBaseUrl: string;
  rejected: boolean;
  onClose: () => void;
  onOpenDiff: (pr: IssuePr) => void;
}

export function IssuePanel({ issue, jiraBaseUrl, rejected, onClose, onOpenDiff }: IssuePanelProps) {
  const { newTab } = useTabs();
  const [prs, setPrs] = useState<IssuePr[]>();

  useEffect(() => {
    setPrs(undefined);
    void window.deck.gh.prsForIssue(issue.key).then(setPrs);
  }, [issue.key]);

  return (
    <div className="flex w-[400px] shrink-0 flex-col border-l border-edge bg-panel">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
        <span className="text-[11px] text-dim">{issue.key}</span>
        <span className="text-[11px] text-orange">◐ {issue.statusName.toLowerCase()}</span>
        <button onClick={onClose} className="ml-auto text-dim hover:text-ink">
          ×
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        <div className="text-sm leading-relaxed text-ink">{issue.summary}</div>
        <div className="flex gap-2 text-[10px]">
          <span className="rounded bg-card2 px-2 py-0.5 text-mut">
            {issue.assignee ?? "unassigned"}
          </span>
          <button
            onClick={() => window.open(`${jiraBaseUrl.replace(/\/$/, "")}/browse/${issue.key}`)}
            className="rounded bg-card2 px-2 py-0.5 text-accent hover:underline"
          >
            open in jira ↗
          </button>
        </div>

        {rejected && (
          <button
            onClick={() =>
              void newTab({
                command: `claude ${JSON.stringify(
                  `${issue.key}: ${issue.summary} — the code was rejected in review. Look at the PR feedback and address it.`,
                )}`,
              })
            }
            className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-left text-[11px] text-red hover:bg-red/20"
          >
            ✗ code rejected — spin up claude
          </button>
        )}

        <div className="pt-1 text-[10px] tracking-widest text-dim">PULL REQUESTS</div>
        {prs === undefined && <div className="text-[11px] text-dim">searching…</div>}
        {prs?.length === 0 && <div className="text-[11px] text-dim">none found</div>}
        {prs?.map((pr) => (
          <div
            key={`${pr.repo}#${pr.number}`}
            className="rounded-lg border border-edge2 bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <span className={`text-[11px] ${stateColor[pr.state] ?? "text-dim"}`}>
                {pr.isDraft ? "draft" : pr.state.toLowerCase()}
              </span>
              <span className="truncate text-xs text-soft">
                #{pr.number} {pr.title}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-dim">{pr.repo.split("/")[1] ?? pr.repo}</div>
            <div className="mt-2 flex gap-3 text-[11px]">
              <button onClick={() => onOpenDiff(pr)} className="text-accent hover:underline">
                view diff
              </button>
              <button onClick={() => window.open(pr.url)} className="text-dim hover:text-ink">
                github ↗
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
