import { AgentSelect, useAgentChoice } from "./AgentSelect.js";
import { useEffect, useRef, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";
import { Markdown } from "../board/Markdown.js";
import { Icon } from "../board/icons.js";

// A conversation with deck about the sessions it tracks. Answers come from a
// headless agent turn that is handed the live session registry, so
// "which sessions need me?" is answerable without opening a single tab.

const SUGGESTIONS = [
  "Which sessions need my attention, and what do I need to answer?",
  "Which of my Jira tasks are in review?",
  "Anything waiting on me that I can answer in one word?",
];

const WAITING: AgentSession["status"][] = ["needs_input", "needs_review"];

interface Turn {
  role: "user" | "deck";
  text: string;
  error?: boolean;
}

function project(cwd: string | null): string {
  return cwd?.split("/").filter(Boolean).pop() ?? "~";
}

function label(s: AgentSession): string {
  return s.title ?? project(s.cwd);
}

export function AskDeck({ sessions, onClose }: { sessions: AgentSession[]; onClose: () => void }) {
  const [agent, setAgent] = useAgentChoice();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** When set, the composer types into this session's terminal instead. */
  const [replyTo, setReplyTo] = useState<AgentSession>();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const waiting = sessions.filter((s) => WAITING.includes(s.status));

  // Streamed text lands on the deck turn that is still being written.
  useEffect(
    () =>
      window.deck.ask.onDelta((delta) =>
        setTurns((t) => {
          const last = t.at(-1);
          if (!last || last.role !== "deck") return t;
          return [...t.slice(0, -1), { ...last, text: last.text + delta }];
        }),
      ),
    [],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns]);

  // A session that stopped waiting is no longer a reply target.
  useEffect(() => {
    if (replyTo && !sessions.some((s) => s.session_id === replyTo.session_id)) {
      setReplyTo(undefined);
    }
  }, [sessions, replyTo]);

  const ask = async (question: string) => {
    if (busy || !question.trim()) return;
    setDraft("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: question }, { role: "deck", text: "" }]);
    try {
      const result = await window.deck.ask.send(question, agent);
      setTurns((turns) => {
        const last = turns.at(-1);
        if (!last || last.role !== "deck") return turns;
        const text = result.ok ? result.text || last.text : result.error || "Could not get an answer.";
        return [...turns.slice(0, -1), { role: "deck", text: text || "No answer.", error: !result.ok }];
      });
    } catch (error) {
      setTurns((turns) => [...turns.slice(0, -1), { role: "deck", text: String(error), error: true }]);
    } finally { setBusy(false); }
  };

  // The reply arrives as one paste; Enter has to be its own keystroke or
  // Claude's input folds it into the pasted text instead of submitting.
  const reply = (session: AgentSession, text: string) => {
    const term = session.term_id;
    if (!term || !text.trim()) return;
    window.deck.term.input(term, `\x1b[200~${text}\x1b[201~`);
    setTimeout(() => window.deck.term.input(term, "\r"), 200);
    setDraft("");
    setTurns((t) => [...t, { role: "user", text: `→ ${label(session)}: ${text}` }]);
    setReplyTo(undefined);
  };

  const submit = () => (replyTo ? reply(replyTo, draft) : void ask(draft));

  const reset = () => {
    void window.deck.ask.reset();
    setTurns([]);
    setReplyTo(undefined);
  };

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l border-edge bg-panel">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3.5">
        <Icon name="sparkle" className="text-accent" />
        <span className="font-bold text-ink">Ask deck</span>
        <fieldset disabled={busy}><AgentSelect value={agent} onChange={(next) => { setAgent(next); reset(); }} /></fieldset>
        <span className="ml-auto flex items-center gap-2.5 text-[11px] text-dim">
          {turns.length > 0 && (
            <button disabled={busy} onClick={reset} className="hover:text-ink disabled:opacity-40" title="Start a new conversation">
              new
            </button>
          )}
          <button onClick={onClose} className="hover:text-ink" title="Hide panel">
            <Icon name="x" size={11} />
          </button>
        </span>
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <>
            <p className="text-[11px] leading-relaxed text-dim">
              Ask about your agents or the tasks on your synced Jira board. Deck includes the latest
              board snapshot and session activity with each question.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="rounded-lg border border-edge2 bg-card px-3 py-2 text-left text-[11px] text-body hover:border-edge3 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </>
        )}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div
              key={i}
              className="self-end whitespace-pre-wrap rounded-lg border border-edge2 bg-card2 px-3 py-2 text-[11px] text-soft"
            >
              {turn.text}
            </div>
          ) : (
            <div key={i} className={turn.error ? "text-[11px] text-red" : ""}>
              {turn.text ? (
                turn.error ? (
                  turn.text
                ) : (
                  <Markdown>{turn.text}</Markdown>
                )
              ) : (
                <span className="text-[11px] text-dim">thinking…</span>
              )}
            </div>
          ),
        )}
      </div>

      {waiting.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-edge px-4 py-2.5">
          <span className="w-full text-[10px] tracking-widest text-dim">REPLY TO</span>
          {waiting.map((s) => (
            <button
              key={s.session_id}
              onClick={() => {
                setReplyTo(s);
                input.current?.focus();
              }}
              disabled={!s.term_id}
              title={
                s.term_id
                  ? `Type an answer straight into ${label(s)}`
                  : "Not running in a deck terminal — open it to reply"
              }
              className={`max-w-full truncate rounded-md border px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                replyTo?.session_id === s.session_id
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-edge2 text-body hover:border-edge3 hover:text-ink"
              }`}
            >
              ✳ {label(s)}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-edge p-2.5">
        {replyTo && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-accent">
            <span className="truncate">replying to {label(replyTo)}</span>
            <button onClick={() => setReplyTo(undefined)} className="text-dim hover:text-ink">
              <Icon name="x" size={10} />
            </button>
          </div>
        )}
        <textarea
          ref={input}
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            replyTo ? `answer ${label(replyTo)}…` : busy ? "deck is answering…" : "ask deck…"
          }
          disabled={busy && !replyTo}
          className="w-full resize-none rounded-lg border border-edge2 bg-card px-3 py-2 text-[11px] text-ink placeholder:text-dim focus:border-edge3 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
