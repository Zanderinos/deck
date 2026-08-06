import { useEffect, useState } from "react";
import type { AgentSession } from "../../../main/sessions.js";

/** Live agent-session list, kept in sync via sessions:changed pushes. */
export function useAgentSessions(): AgentSession[] {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  useEffect(() => {
    void window.deck.sessions.list().then(setSessions);
    return window.deck.sessions.onChanged(setSessions);
  }, []);
  return sessions;
}
