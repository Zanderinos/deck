import { agentLabels, type Agent } from "../../../shared/agents.js";
import type { TermMeta } from "../../../main/pty.js";
import { useEffect, useState } from "react";
import type { IssuePr, PrDetail } from "../../../main/github.js";
import type { AgentSession } from "../../../main/sessions.js";
import { useAgentSessions } from "../lib/useSessions.js";
import { TerminalPane } from "../terminal/TerminalPane.js";
import { Icon } from "./icons.js";

const openingTerms = new Map<string, Promise<TermMeta>>();

const DRAFTS_URL = "http://127.0.0.1:47800/api/pr-drafts";

const statusLabel: Record<AgentSession["status"], { label: string; color: string }> = {
  working: { label: "working", color: "text-blue" },
  needs_input: { label: "needs input", color: "text-orange" },
  needs_review: { label: "needs review", color: "text-orange" },
  idle: { label: "idle", color: "text-green" },
  ended: { label: "ended", color: "text-dim" },
};

const isAuthor = (detail: PrDetail | null | undefined) =>
  Boolean(detail && detail.viewer && detail.viewer === detail.author);

const contextPrompt = (pr: IssuePr, detail: PrDetail | null | undefined) =>
  `We are working on PR #${pr.number} in ${pr.repo} — "${pr.title}"` +
  (detail ? ` (${detail.headRefName} → ${detail.baseRefName}).` : ".") +
  (isAuthor(detail)
    ? " It is my own PR: I may ask you to continue the task, improve the code, or address feedback."
    : " I am reviewing it and may ask you about the change, to draft comments, or to address feedback.") +
  ` This checkout is the PR's repository. Use \`gh pr diff ${pr.number}\` and \`gh pr view ${pr.number} --comments\` for the change and its discussion. Wait for instructions.`;

const improvePrompt = (pr: IssuePr, detail: PrDetail | null | undefined) =>
  `Read the diff of my PR #${pr.number} in ${pr.repo} (\`gh pr diff ${pr.number}\`)` +
  (detail ? `, on branch ${detail.headRefName},` : "") +
  ` and look for what is worth improving before others review it: bugs, missed edge cases, unclear names, duplicated logic, missing tests. Make the changes on the branch in this checkout, run the project's checks, and show me the diff before committing.`;

const draftPrompt = (pr: IssuePr) =>
  `Review PR #${pr.number} in ${pr.repo} (\`gh pr diff ${pr.number}\`) for real problems — bugs, missed cases, unclear naming — not style nits. ` +
  `Write each finding as a review comment and send them all to deck as one JSON array of {"path","line","side":"RIGHT","body"} (line is the new-side line number):\n` +
  `curl -s -m 3 -X POST '${DRAFTS_URL}' -H "x-deck-term: $DECK_TERM_ID" -H 'Content-Type: application/json' --data-binary @/tmp/deck-pr-drafts.json\n` +
  `They appear as drafts in the review screen for me to edit and send; do not post anything to GitHub yourself. If nothing is worth commenting, say so.`;

const fixPrompt = (pr: IssuePr, detail: PrDetail | null | undefined) =>
  `Address the open review feedback on PR #${pr.number} in ${pr.repo}` +
  (detail ? ` (branch ${detail.headRefName})` : "") +
  `: read the unresolved threads with \`gh api repos/${pr.repo}/pulls/${pr.number}/comments\` and \`gh pr view ${pr.number} --comments\`, check out the PR branch if this checkout is not on it, make the changes, run the project's checks, and commit in one line without agent authorship. Show me the diff before pushing.`;

export interface PrAgentPanelProps {
  agent: Agent;
  pr: IssuePr;
  detail: PrDetail | null | undefined;
  cwd: string | undefined;
  issueKey?: string;
  /** Prompt handed in from elsewhere on the screen (the selection bar's Ask agent). */
  pending: string | undefined;
  onPendingSent: () => void;
  onTermId: (termId: string | undefined) => void;
  onClose: () => void;
}

/**
 * An agent session pinned to this PR, living in a pty like every other deck
 * terminal so it survives reloads and shows up in the sessions list. The
 * terminal itself is the transcript and the input; quick actions type into it.
 */
export function PrAgentPanel({
  agent,
  pr,
  detail,
  cwd,
  issueKey,
  pending,
  onPendingSent,
  onTermId,
  onClose,
}: PrAgentPanelProps) {
  const storageKey = `deck.pr.agent.${pr.repo}#${pr.number}${agent === "codex" ? ":codex" : ""}`;
  const [termId, setTermId] = useState<string>();
  const [title, setTitle] = useState(agentLabels[agent]);
  const [error, setError] = useState("");
  const sessions = useAgentSessions();
  const session = termId ? sessions.find((s) => s.term_id === termId) : undefined;

  // Reattach to the PR's terminal if it is still alive, else start one — once
  // the PR detail is in, so the opening prompt knows whose PR this is.
  useEffect(() => {
    if (detail === undefined) return;
    let cancelled = false;
    let opening = openingTerms.get(storageKey);
    if (!opening) {
      opening = window.deck.term.list().then(async (terms) => {
        const remembered = sessionStorage.getItem(storageKey);
        const existing = terms.find((term) => term.id === remembered);
        if (existing) return existing;
        const meta = await window.deck.term.create({ cwd, agent, prompt: contextPrompt(pr, detail), issueKey });
        sessionStorage.setItem(storageKey, meta.id);
        return meta;
      });
      openingTerms.set(storageKey, opening);
      void opening.finally(() => openingTerms.delete(storageKey)).catch(() => {});
    }
    void opening.then((meta) => { if (!cancelled) setTermId(meta.id); })
      .catch((error) => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
    // Detail content can refresh without replacing the active terminal.
  }, [storageKey, detail === undefined]);

  useEffect(() => {
    if (termId) sessionStorage.setItem(storageKey, termId);
    onTermId(termId);
  }, [termId, storageKey, onTermId]);

  // A closed pty drops the panel back to a fresh session next time it opens.
  useEffect(
    () =>
      window.deck.term.onExit((id) => {
        if (id !== termId) return;
        sessionStorage.removeItem(storageKey);
        setTermId(undefined);
      }),
    [termId, storageKey],
  );

  // The prompt arrives as one paste; Enter has to come as its own keystroke
  // or Claude's input folds it into the pasted text instead of submitting.
  const send = (prompt: string) => {
    if (!termId) return;
    window.deck.term.input(termId, `\x1b[200~${prompt}\x1b[201~`);
    setTimeout(() => window.deck.term.input(termId, "\r"), 200);
  };

  useEffect(() => {
    if (!pending || !termId) return;
    send(pending);
    onPendingSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, termId]);

  const status = session ? statusLabel[session.status] : undefined;

  return (
    <div className="absolute bottom-0 right-0 top-0 z-30 flex w-[440px] flex-col border-l border-edge bg-panel shadow-xl">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2 font-sans text-[12px]">
        <Icon name="sparkle" className="text-accent" />
        <span className="text-ink">Agent</span>
        <span className="truncate text-dim">{title}</span>
        {status && <span className={`ml-auto text-[11px] ${status.color}`}>{status.label}</span>}
        <button
          onClick={onClose}
          className={`${status ? "" : "ml-auto"} text-dim hover:text-ink`}
          title="Close panel"
        >
          <Icon name="x" size={11} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 border-b border-edge px-3 py-1.5 font-sans text-[11px]">
        {isAuthor(detail) ? (
          <button
            onClick={() => send(improvePrompt(pr, detail))}
            disabled={!termId}
            className="rounded-md border border-edge2 px-2 py-0.5 text-body hover:border-edge3 hover:text-ink disabled:opacity-40"
            title="The selected agent improves your diff on the branch"
          >
            <Icon name="sparkle" size={10} /> Improve
          </button>
        ) : (
          <button
            onClick={() => send(draftPrompt(pr))}
            disabled={!termId}
            className="rounded-md border border-edge2 px-2 py-0.5 text-body hover:border-edge3 hover:text-ink disabled:opacity-40"
            title="The selected agent reviews the diff and returns draft comments"
          >
            <Icon name="pencil" size={10} /> Draft review comments
          </button>
        )}
        <button
          onClick={() => send(fixPrompt(pr, detail))}
          disabled={!termId}
          className="rounded-md border border-edge2 px-2 py-0.5 text-body hover:border-edge3 hover:text-ink disabled:opacity-40"
          title="The selected agent addresses open review threads"
        >
          <Icon name="check" size={10} /> Address feedback
        </button>
        {!cwd && <span className="ml-auto text-dim">no local checkout found</span>}
      </div>
      <div className="min-h-0 flex-1 p-1">
        {termId ? (
          <TerminalPane termId={termId} active onTitle={setTitle} />
        ) : (
          <div className="p-3 font-sans text-[11px] text-dim">{error || `starting ${agentLabels[agent]}…`}</div>
        )}
      </div>
    </div>
  );
}
