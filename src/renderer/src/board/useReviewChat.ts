import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewPr } from "../../../main/review.js";
import type { Agent } from "../../../shared/agents.js";
import { applyEvent, finishTurn, loadTurns, saveTurns, type ChatTurn } from "../agents/ChatTurns.js";

// The conversation with one PR's review assistant. Turns live in localStorage
// under the PR's key and the main process keeps the matching claude session,
// so coming back to the review after a restart finds the chat where it was.

export interface ReviewChat {
  turns: ChatTurn[];
  busy: boolean;
  ask: (question: string) => Promise<void>;
  /** Starts the conversation over; drafts are untouched. */
  reset: () => void;
}

export const reviewKey = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;

export function useReviewChat(pr: ReviewPr, agent: Agent): ReviewChat {
  const key = reviewKey(pr);
  const storage = `deck.review.turns.${key}`;
  const [turns, setTurns] = useState<ChatTurn[]>(() => loadTurns(storage));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const prRef = useRef(pr);
  prRef.current = pr;

  useEffect(() => saveTurns(storage, turns), [storage, turns]);

  useEffect(() => window.deck.review.onEvent((forKey, event) => {
    if (forKey === key) setTurns((t) => applyEvent(t, event));
  }), [key]);

  const ask = useCallback(async (question: string) => {
    if (busyRef.current || !question.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: question, steps: [] }, { role: "deck", text: "", steps: [] }]);
    try {
      const result = await window.deck.review.send(prRef.current, question, agent);
      setTurns((t) => finishTurn(t, result));
    } catch (error) {
      setTurns((t) => [...t.slice(0, -1), { role: "deck", text: String(error), steps: [], error: true }]);
    } finally { busyRef.current = false; setBusy(false); }
  }, [agent]);

  const reset = useCallback(() => {
    void window.deck.review.reset(prRef.current.repo, prRef.current.number);
    setTurns([]);
  }, []);

  return { turns, busy, ask, reset };
}
