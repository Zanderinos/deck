import { useEffect, useState } from "react";
import type { IssuePr, ReviewEvent } from "../../../main/github.js";
import type { InboxPr } from "../../../main/prInbox.js";
import { onOpenPullRequest, type OpenPrDetail } from "../lib/bus.js";
import { issueFor, useReviewQueue } from "../lib/reviews.js";
import { Icon } from "./icons.js";
import { PrScreen } from "./PrScreen.js";

// The review queue: every PR waiting on the user's review, one at a time,
// with next/previous like a mail client. Approving or requesting changes
// moves on by itself; the PR screen underneath is the same one the board opens.

const isTyping = (e: KeyboardEvent) => ["TEXTAREA", "INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "");

const toIssuePr = (pr: InboxPr): IssuePr => ({ repo: pr.repo, number: pr.number, title: pr.title, state: "OPEN", isDraft: pr.isDraft, url: pr.url, author: pr.author, updatedAt: pr.updatedAt });

export function ReviewsView({ visible }: { visible: boolean }) {
  const [done, setDone] = useState(new Set<string>());
  const { queue, board, jiraBaseUrl, loaded } = useReviewQueue(done);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<{ key: string; event: ReviewEvent }>();
  // A PR reached from a stack link, which need not be in the queue at all.
  const [linked, setLinked] = useState<OpenPrDetail>();

  useEffect(() => onOpenPullRequest(setLinked), []);

  const queued = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const current = linked
    ? queue.find((pr) => pr.repo === linked.repo && pr.number === linked.number)
      ?? { ...linked, reviewDecision: null, mergeable: "UNKNOWN", checks: "NONE", headRefName: "", baseRefName: "" }
    : queued;
  const position = current ? queue.indexOf(current) : -1;
  const issue = current ? issueFor(current, board) : undefined;

  const go = (delta: number) => {
    const from = position >= 0 ? position : index;
    setLinked(undefined);
    setIndex(Math.min(Math.max(from + delta, 0), Math.max(queue.length - 1, 0)));
  };

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
          {loaded ? "Inbox zero: no pull requests are waiting on your review." : "Waiting for GitHub…"}
        </div>
      )}
    </div>
  );
}
