import type { Agent } from "../../../shared/agents.js";
import type { AgentSession } from "../../../main/sessions.js";
import { Icon } from "../board/icons.js";

export const statusLabels: Record<AgentSession["status"], string> = {
  working: "Working", needs_input: "Needs input", needs_review: "Needs review", idle: "Ready", ended: "Ended",
};
const statusColors: Record<AgentSession["status"], string> = {
  working: "bg-accent animate-pulse", needs_input: "bg-orange", needs_review: "bg-orange", idle: "bg-green", ended: "bg-dim",
};

/** Agent avatar with its live status dot, shared by the sidebar and the archive. */
export function SessionIcon({ agent, status }: { agent?: Agent; status?: AgentSession["status"] }) {
  return <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card2 text-soft">
    {agent === "codex" ? <span className="text-lg leading-none">◎</span> : <Icon name={agent === "claude" ? "sparkle" : "terminal"} size={16} />}
    {status && <span title={statusLabels[status]} className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${statusColors[status]}`} />}
  </span>;
}
