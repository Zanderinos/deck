import { useEffect, useMemo, useState } from "react";
import type { BoardCache, BoardIssue } from "../../../main/jira.js";
import type { InboxPr } from "../../../main/prInbox.js";
import type { JiraSettings } from "../../../shared/settings.js";
import { usePrInbox } from "./useInbox.js";

// The review queue behind both the sidebar badge and the reviews page, so the
// two never disagree about how many PRs are waiting.

const ISSUE_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;

/** The Jira card a PR belongs to, by key in its title or branch. */
export function issueFor(pr: InboxPr, board: BoardCache | undefined): BoardIssue | undefined {
  const key = ISSUE_KEY.exec(`${pr.title} ${pr.headRefName}`)?.[0];
  return key ? board?.issues.find((i) => i.key === key) : undefined;
}

/** Non-draft review requests, oldest first so nothing sits unreviewed while
 *  new ones jump the queue. With review columns configured, only PRs whose
 *  card sits in one of those columns make it in. */
export function reviewQueue(requested: InboxPr[], board: BoardCache | undefined, reviewColumns: string[], done = new Set<string>()): InboxPr[] {
  const statusIds = new Set(board?.columns.filter((c) => reviewColumns.includes(c.name)).flatMap((c) => c.statusIds));
  const inReview = (pr: InboxPr) => {
    if (reviewColumns.length === 0) return true;
    const issue = issueFor(pr, board);
    return Boolean(issue && statusIds.has(issue.statusId));
  };
  return requested
    .filter((pr) => !pr.isDraft && !done.has(`${pr.repo}#${pr.number}`) && inReview(pr))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** Live review queue plus the board and Jira settings it was built from. */
export function useReviewQueue(done = new Set<string>()) {
  const inbox = usePrInbox();
  const [board, setBoard] = useState<BoardCache>();
  const [jira, setJira] = useState<JiraSettings>();

  useEffect(() => {
    void window.deck.board.get().then(setBoard);
    void window.deck.getSettings().then((s) => setJira(s.jira));
    const offBoard = window.deck.board.onChanged(setBoard);
    const offSettings = window.deck.onSettingsChanged((s) => setJira(s.jira));
    return () => { offBoard(); offSettings(); };
  }, []);

  const queue = useMemo(() => reviewQueue(inbox?.reviewRequested ?? [], board, jira?.reviewColumns ?? [], done), [inbox, board, jira, done]);
  return { queue, board, jiraBaseUrl: jira?.baseUrl, loaded: inbox !== undefined };
}
