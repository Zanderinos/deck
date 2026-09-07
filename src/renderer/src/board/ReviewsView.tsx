import { useEffect, useMemo, useState } from "react";
import type { IssuePr, ReviewEvent } from "../../../main/github.js";
import type { BoardCache, BoardIssue } from "../../../main/jira.js";
import type { InboxPr } from "../../../main/prInbox.js";
import { usePrInbox } from "../lib/useInbox.js";
import { Icon } from "./icons.js";
import { PrScreen } from "./PrScreen.js";

// The review queue: every PR waiting on the user's review, one at a time,
// with next/previous like a mail client. Approving or requesting changes
// moves on by itself; the PR screen underneath is the same one the board opens.

const ISSUE_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;

const isTyping = (e: KeyboardEvent) => ["TEXTAREA", "INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "");

/** The Jira card a PR belongs to, by key in its title or branch. */
export function issueFor(pr: InboxPr, board: BoardCache | undefined): BoardIssue | undefined {
  const key = ISSUE_KEY.exec(`${pr.title} ${pr.headRefName}`)?.[0];
  return key ? board?.issues.find((i) => i.key === key) : undefined;
}

/** Oldest request first, so nothing sits unreviewed while new ones jump the queue. */
export function reviewQueue(requested: InboxPr[], done: Set<string>): InboxPr[] {
  return requested.filter((pr) => !pr.isDraft && !done.has(`${pr.repo}#${pr.number}`)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

const toIssuePr = (pr: InboxPr): IssuePr => ({ repo: pr.repo, number: pr.number, title: pr.title, state: "OPEN", isDraft: pr.isDraft, url: pr.url, author: pr.author, updatedAt: pr.updatedAt });

export function ReviewsView({ visible }: { visible: boolean }) {
  const inbox = usePrInbox();
  const [board, setBoard] = useState<BoardCache>();
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>();
  const [done, setDone] = useState(new Set<string>());
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<{ key: string; event: ReviewEvent }>();

  useEffect(() => {
    void window.deck.board.get().then(setBoard);
    void window.deck.getSettings().then((s) => setJiraBaseUrl(s.jira.baseUrl));
    return window.deck.board.onChanged(setBoard);
  }, []);

  const queue = useMemo(() => reviewQueue(inbox?.reviewRequested ?? [], done), [inbox, done]);
  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const position = current ? queue.indexOf(current) : -1;
  const issue = current ? issueFor(current, board) : undefined;

  const go = (delta: number) => setIndex(Math.min(Math.max(position + delta, 0), Math.max(queue.length - 1, 0)));

  const onReviewed = (event: ReviewEvent) => {
    if (!current || event === "COMMENT") return;
    const key = `${current.repo}#${current.number}`;
    setReviewed({ key, event });
    // Leave the confirmation visible for a beat, then the queue closes over it.
    setTimeout(() => {
      setDone((d) => new Set(d).add(key));
      setReviewed((r) => (r?.key === key ? undefined : r));
    }, 900);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "]") go(1);
      else if (e.key === "p" || e.key === "[") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`${visible ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col`}>
      <div className="flex items-center gap-3 border-b border-edge px-6 py-3 font-sans text-[12px]">
        <span className="font-bold text-ink">Reviews</span>
        <span className="text-[11px] text-dim">{queue.length === 0 ? "nothing waiting on you" : `${position + 1} of ${queue.length}`}</span>
        {issue && (
          <button onClick={() => jiraBaseUrl && window.open(`${jiraBaseUrl}/browse/${issue.key}`)} className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-body hover:text-ink" title={`Open ${issue.key} in Jira`}>
            <Icon name="jira" size={11} className="text-dim" /><span className="text-mut">{issue.key}</span><span className="truncate">{issue.summary}</span><span className="shrink-0 text-dim">· {issue.statusName}</span>
          </button>
        )}
        {reviewed && <span className={`text-[11px] ${reviewed.event === "APPROVE" ? "text-green" : "text-red"}`}>{reviewed.event === "APPROVE" ? "✓ approved" : "✗ changes requested"} — next…</span>}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-dim">
          <button aria-label="Previous review" title="Previous (p)" disabled={position <= 0} onClick={() => go(-1)} className="rounded px-1.5 py-0.5 hover:bg-card2 hover:text-ink disabled:opacity-30">‹ prev</button>
          <button aria-label="Next review" title="Next (n)" disabled={position < 0 || position >= queue.length - 1} onClick={() => go(1)} className="rounded px-1.5 py-0.5 hover:bg-card2 hover:text-ink disabled:opacity-30">next ›</button>
        </span>
      </div>
      {current && visible ? (
        <PrScreen key={`${current.repo}#${current.number}`} embedded pr={toIssuePr(current)} issue={issue} jiraBaseUrl={jiraBaseUrl} onClose={() => {}} onReviewed={onReviewed} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[12px] text-dim">
          <Icon name="check" size={20} className="text-green" />
          {inbox ? "Inbox zero: no pull requests are waiting on your review." : "Waiting for GitHub…"}
        </div>
      )}
    </div>
  );
}
