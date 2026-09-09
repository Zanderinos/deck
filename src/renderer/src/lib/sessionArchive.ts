import type { AgentSession } from "../../../main/sessions.js";

// The session archive: every session deck has ever seen, newest first and
// grouped by the day it was last touched, the way Arc lists archived tabs.

export interface ArchiveGroup {
  label: string;
  sessions: AgentSession[];
}

const dayLabel = (updatedAt: number, now: number): string => {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday - new Date(updatedAt).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return "Earlier";
};

/** Resumable sessions matching `query`, newest first, grouped by day. Sessions
 *  still being registered (`pending:` ids) have nothing to resume yet. */
export function archiveGroups(sessions: AgentSession[], query: string, now = Date.now()): ArchiveGroup[] {
  const needle = query.trim().toLowerCase();
  const groups: ArchiveGroup[] = [];
  const matches = sessions
    .filter((session) => !session.session_id.startsWith("pending:"))
    .filter((session) => [session.title, session.cwd, session.agent, session.issue_key].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => b.updated_at - a.updated_at);
  for (const session of matches) {
    const label = dayLabel(session.updated_at, now);
    const group = groups.at(-1);
    if (group?.label === label) group.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  }
  return groups;
}
