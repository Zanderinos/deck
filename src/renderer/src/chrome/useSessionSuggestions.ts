import { useEffect, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";

const RECENT_WINDOW_MS = 15 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 1000;
const DISMISSED_KEY = "deck.dismissed-session-suggestions";

function savedDismissals(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

export function useSessionSuggestions(sessions: AgentSession[]) {
  const [dismissed, setDismissed] = useState(savedDismissals);
  const [, refresh] = useState(0);
  const now = Date.now();
  const recent = sessions.filter((session) => session.updated_at > now - RECENT_WINDOW_MS && session.updated_at <= now);

  // Expire a suggestion even when no new agent events arrive. Refresh on
  // focus too, because background windows can have their timers throttled.
  useEffect(() => {
    const nextExpiry = Math.min(REFRESH_INTERVAL_MS, ...recent.map((session) => session.updated_at + RECENT_WINDOW_MS - now));
    if (!recent.length) return;
    const timer = setTimeout(() => refresh((revision) => revision + 1), Math.max(1, nextExpiry));
    return () => clearTimeout(timer);
  }, [sessions, now]);
  useEffect(() => {
    const onFocus = () => refresh((revision) => revision + 1);
    const onStorage = (event: StorageEvent) => { if (event.key === DISMISSED_KEY) setDismissed(savedDismissals()); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("storage", onStorage); };
  }, []);

  const dismissSessions = (ids: string[]) => {
    const next = [...new Set([...dismissed, ...ids])];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    setDismissed(next);
  };
  return {
    suggestions: recent.filter((session) => !dismissed.includes(session.session_id)).sort((first, second) => second.updated_at - first.updated_at),
    dismissSessions,
  };
}
