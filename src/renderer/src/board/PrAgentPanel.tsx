import { useEffect, useRef, useState } from "react";
import type { IssuePr, PrDetail } from "../../../main/github.js";
import type { Agent } from "../../../shared/agents.js";
import { AgentSelect } from "../agents/AgentSelect.js";
import { ChatTurns } from "../agents/ChatTurns.js";
import { openTerminalTab } from "../lib/bus.js";
import { Icon } from "./icons.js";
import type { ReviewChat } from "./useReviewChat.js";

// The review assistant next to the diff: a conversation about this PR whose
// findings arrive as draft comments in the review screen. It is not a
// terminal session, so it never shows up in the sidebar; work that edits the
// branch (improving your own PR, addressing feedback) still goes to a proper
// coding agent in a terminal tab.

const isAuthor = (detail: PrDetail | null | undefined) =>
  Boolean(detail && detail.viewer && detail.viewer === detail.author);

const DRAFT_PROMPT = "Review the diff for real problems — bugs, missed cases, unclear naming, duplicated logic, missing tests — and add each finding as a draft comment on the right line. Skip style nits. Then summarise what you drafted in a few lines.";
const EXPLAIN_PROMPT = "Walk me through this change: what it does, how the pieces fit together, and anything risky or surprising I should look at first.";

const improvePrompt = (pr: IssuePr, detail: PrDetail | null | undefined) =>
  `Read the diff of my PR #${pr.number} in ${pr.repo} (\`gh pr diff ${pr.number}\`)` +
  (detail ? `, on branch ${detail.headRefName},` : "") +
  ` and look for what is worth improving before others review it: bugs, missed edge cases, unclear names, duplicated logic, missing tests. Make the changes on the branch in this checkout, run the project's checks, and show me the diff before committing.`;

const fixPrompt = (pr: IssuePr, detail: PrDetail | null | undefined) =>
  `Address the open review feedback on PR #${pr.number} in ${pr.repo}` +
  (detail ? ` (branch ${detail.headRefName})` : "") +
  `: read the unresolved threads with \`gh api repos/${pr.repo}/pulls/${pr.number}/comments\` and \`gh pr view ${pr.number} --comments\`, check out the PR branch if this checkout is not on it, make the changes, run the project's checks, and commit in one line without agent authorship. Show me the diff before pushing.`;

export interface PrAgentPanelProps {
  pr: IssuePr;
  detail: PrDetail | null | undefined;
  cwd: string | undefined;
  issueKey?: string;
  agent: Agent;
  onAgent: (agent: Agent) => void;
  chat: ReviewChat;
  onClose: () => void;
}

export function PrAgentPanel({ pr, detail, cwd, issueKey, agent, onAgent, chat, onClose }: PrAgentPanelProps) {
  const { turns, busy, ask, reset } = chat;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [turns]);
  useEffect(() => { input.current?.focus(); }, []);

  const send = (question: string) => { setDraft(""); void ask(question); };
  const startCodingAgent = (prompt: string) => openTerminalTab({ cwd, agent, prompt, issueKey });

  const action = (label: string, icon: "pencil" | "sparkle" | "check", onClick: () => void, title: string, disabled = false) => (
    <button key={label} onClick={onClick} disabled={disabled} title={title}
      className="flex items-center gap-1 rounded-md border border-edge2 px-2 py-0.5 text-[11px] text-body hover:border-edge3 hover:text-ink disabled:opacity-40">
      <Icon name={icon} size={10} /> {label}
    </button>
  );

  return (
    <section aria-label="Review assistant" className="absolute bottom-0 right-0 top-0 z-30 flex w-[440px] flex-col border-l border-edge bg-panel shadow-xl font-sans">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2 text-[12px]">
        <Icon name="sparkle" className="text-accent" />
        <span className="text-ink">Review assistant</span>
        <span className="truncate text-dim">#{pr.number}</span>
        {turns.length > 0 && <button onClick={reset} className="ml-auto rounded-md border border-edge2 px-2 py-0.5 text-[11px] text-body hover:text-ink" title="Start the conversation over (drafts stay)">New chat</button>}
        <button onClick={onClose} className={`${turns.length > 0 ? "" : "ml-auto"} text-dim hover:text-ink`} aria-label="Close review assistant" title="Close (a)">
          <Icon name="x" size={11} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-edge px-3 py-1.5">
        {isAuthor(detail) ? (
          <>
            {action("Improve on branch", "sparkle", () => startCodingAgent(improvePrompt(pr, detail)), "A coding agent improves your diff in a terminal tab", !cwd)}
            {action("Address feedback", "check", () => startCodingAgent(fixPrompt(pr, detail)), "A coding agent addresses open review threads in a terminal tab", !cwd)}
          </>
        ) : (
          <>
            {action("Draft review comments", "pencil", () => send(DRAFT_PROMPT), "Reviews the diff and puts findings in the review screen as drafts", busy)}
            {action("Explain the change", "sparkle", () => send(EXPLAIN_PROMPT), "A guided tour of the diff", busy)}
          </>
        )}
        {!cwd && <span className="ml-auto text-[11px] text-dim">no local checkout</span>}
      </div>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-dim">
            <p>Ask anything about this pull request. The assistant reads the diff, the existing threads and the local checkout.</p>
            <p>Review comments it writes appear as <span className="text-accent">drafts</span> in the diff for you to edit and send with your review; nothing goes to GitHub on its own.</p>
            <p>Select lines in the diff and choose <span className="text-soft">Ask agent</span> to bring them here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3"><ChatTurns turns={turns} /></div>
        )}
      </div>
      <div className="border-t border-edge p-2">
        <div className="rounded-xl border border-edge2 bg-card">
          <textarea
            ref={input}
            aria-label="Ask the review assistant"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            placeholder={busy ? "thinking…" : "Ask about this PR…"}
            disabled={busy}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[12px] text-ink placeholder:text-dim focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <fieldset disabled={busy}><AgentSelect value={agent} onChange={onAgent} /></fieldset>
            <button aria-label="Send" title="Send (Enter)" disabled={busy || !draft.trim()} onClick={() => send(draft)}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg disabled:opacity-30">↑</button>
          </div>
        </div>
      </div>
    </section>
  );
}
