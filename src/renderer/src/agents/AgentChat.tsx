import { useEffect, useRef, useState } from "react";
import type { AskEvent } from "../../../main/ask.js";
import type { AgentSession } from "../../../main/sessions.js";
import type { Agent } from "../../../shared/agents.js";
import { Markdown } from "../board/Markdown.js";
import { Icon } from "../board/icons.js";
import { AgentSelect } from "./AgentSelect.js";
import { isWaiting, project } from "./attention.js";

// The conversation with deck's agent. Answers come from a headless agent turn
// that is handed the live sessions, PR inbox and Jira board, plus deck's MCP
// tools, so it can start agents, steer them and act on PRs from here.

const EXAMPLES: { title: string; hint: string; prompt: string }[] = [
  { title: "PRs to review", hint: "Which pull requests are waiting on my review?", prompt: "Which PRs need my review? List them with repo, title and how long they have waited." },
  { title: "My PRs needing attention", hint: "Rejected, CI failing or conflicting", prompt: "Do any of my PRs need my attention: changes requested, CI failing or merge conflicts? Tell me which already have a fix agent on them." },
  { title: "Agents needing me", hint: "Sessions waiting for an answer or a review", prompt: "Which agents need my attention, and what does each one need from me?" },
  { title: "Plan the next epic", hint: "Turn a goal into small, shippable tasks", prompt: "Let's plan our next epic. Look at the open epics and backlog first, then ask me what the goal is." },
  { title: "Find a task to fix now", hint: "A small backlog item with a local checkout", prompt: "Find a task in the backlog that we can fix right now: small, well described, with a repo I have checked out. Explain your pick and offer to start an agent on it." },
];

interface Turn {
  role: "user" | "deck";
  text: string;
  /** Deck tools the assistant used while answering. */
  steps: string[];
  error?: boolean;
}

const label = (s: AgentSession): string => s.title ?? project(s.cwd);

export function AgentChat({ agent, onAgent, sessions, turns, onTurns }: {
  agent: Agent;
  onAgent: (agent: Agent) => void;
  sessions: AgentSession[];
  turns: Turn[];
  onTurns: (update: (turns: Turn[]) => Turn[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** When set, the composer types into this session's terminal instead. */
  const [replyTo, setReplyTo] = useState<AgentSession>();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const waiting = sessions.filter(isWaiting);

  // Streamed events land on the deck turn that is still being written.
  useEffect(() => window.deck.ask.onEvent((event: AskEvent) => onTurns((t) => {
    const last = t.at(-1);
    if (!last || last.role !== "deck") return t;
    const next = event.type === "text" ? { ...last, text: last.text + event.text } : { ...last, steps: [...last.steps, `${event.name} ${event.input}`] };
    return [...t.slice(0, -1), next];
  })), [onTurns]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [turns]);

  useEffect(() => {
    if (replyTo && !sessions.some((s) => s.session_id === replyTo.session_id)) setReplyTo(undefined);
  }, [sessions, replyTo]);

  const ask = async (question: string) => {
    if (busy || !question.trim()) return;
    setDraft("");
    setBusy(true);
    onTurns((t) => [...t, { role: "user", text: question, steps: [] }, { role: "deck", text: "", steps: [] }]);
    try {
      const result = await window.deck.ask.send(question, agent);
      onTurns((turns) => {
        const last = turns.at(-1);
        if (!last || last.role !== "deck") return turns;
        const text = result.ok ? result.text || last.text : result.error || "Could not get an answer.";
        return [...turns.slice(0, -1), { ...last, text: text || "No answer.", error: !result.ok }];
      });
    } catch (error) {
      onTurns((turns) => [...turns.slice(0, -1), { role: "deck", text: String(error), steps: [], error: true }]);
    } finally { setBusy(false); }
  };

  // The reply arrives as one paste; Enter has to be its own keystroke or the
  // agent's input folds it into the pasted text instead of submitting.
  const reply = (session: AgentSession, text: string) => {
    const term = session.term_id;
    if (!term || !text.trim()) return;
    window.deck.term.input(term, `\x1b[200~${text}\x1b[201~`);
    setTimeout(() => window.deck.term.input(term, "\r"), 200);
    setDraft("");
    onTurns((t) => [...t, { role: "user", text: `→ ${label(session)}: ${text}`, steps: [] }]);
    setReplyTo(undefined);
  };

  const submit = () => (replyTo ? reply(replyTo, draft) : void ask(draft));
  const empty = turns.length === 0;

  const composer = (
    <div className={`rounded-xl border border-edge2 bg-card ${empty ? "shadow-[0_0_0_1px_rgba(167,139,250,0.08)]" : ""}`}>
      {replyTo && (
        <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] text-accent">
          <span className="truncate">replying to {label(replyTo)}</span>
          <button onClick={() => setReplyTo(undefined)} className="text-dim hover:text-ink" aria-label="Stop replying"><Icon name="x" size={10} /></button>
        </div>
      )}
      <textarea
        ref={input}
        aria-label="Ask deck"
        value={draft}
        rows={empty ? 2 : 2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={replyTo ? `answer ${label(replyTo)}…` : busy ? "deck is working…" : "Ask deck…"}
        disabled={busy && !replyTo}
        className="w-full resize-none bg-transparent px-4 pt-3.5 text-[13px] text-ink placeholder:text-dim focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <fieldset disabled={busy}><AgentSelect value={agent} onChange={onAgent} /></fieldset>
        {waiting.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[10px] tracking-widest text-dim">REPLY TO</span>
            {waiting.map((s) => (
              <button key={s.session_id} disabled={!s.term_id} onClick={() => { setReplyTo(s); input.current?.focus(); }}
                title={s.term_id ? `Type an answer straight into ${label(s)}` : "Not running in a deck terminal — open it to reply"}
                className={`max-w-[180px] truncate rounded-md border px-2 py-0.5 text-[11px] disabled:opacity-40 ${replyTo?.session_id === s.session_id ? "border-accent/50 bg-accent/10 text-accent" : "border-edge2 text-body hover:border-edge3 hover:text-ink"}`}>
                ✳ {label(s)}
              </button>
            ))}
          </div>
        )}
        <button aria-label="Send" title="Send (Enter)" disabled={(busy && !replyTo) || !draft.trim()} onClick={submit}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg disabled:opacity-30">↑</button>
      </div>
    </div>
  );

  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-10">
        <div className="w-full max-w-[760px]">
          {composer}
          <div className="mt-6 text-[12px] text-dim">Get started with some examples</div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {EXAMPLES.map((e) => (
              <button key={e.title} aria-label={e.title} onClick={() => void ask(e.prompt)}
                className="flex min-h-[120px] flex-col rounded-xl border border-edge2 bg-card px-4 py-4 text-left hover:border-edge3">
                <Icon name="sparkle" size={14} className="text-accent" />
                <span className="mt-auto block text-[13px] text-ink">{e.title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-dim">{e.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          {turns.map((turn, i) => turn.role === "user" ? (
            <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl border border-edge2 bg-card2 px-4 py-2.5 text-[12px] text-soft">{turn.text}</div>
          ) : (
            <div key={i} className="text-[12px]">
              {turn.steps.length > 0 && (
                <ol className="mb-2 flex flex-col gap-1 text-[11px] text-dim" aria-label="Deck tools used">
                  {turn.steps.map((step, j) => <li key={j} className="truncate"><span className="text-accent">⚙</span> {step}</li>)}
                </ol>
              )}
              {turn.text ? (turn.error ? <span className="text-red">{turn.text}</span> : <Markdown>{turn.text}</Markdown>) : <span className="text-dim">thinking…</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="px-8 pb-5"><div className="mx-auto w-full max-w-[760px]">{composer}</div></div>
    </div>
  );
}

export type { Turn as ChatTurn };
