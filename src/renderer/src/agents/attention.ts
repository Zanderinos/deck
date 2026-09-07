import type { InboxPr } from "../../../main/prInbox.js";
import type { AgentSession } from "../../../main/sessions.js";

// What the agent page and the sidebar badge count as "needs me".

export const WAITING: AgentSession["status"][] = ["needs_input", "needs_review"];

export const isWaiting = (s: AgentSession): boolean => WAITING.includes(s.status);

export function prProblems(pr: InboxPr): string[] {
  const problems: string[] = [];
  if (pr.reviewDecision === "CHANGES_REQUESTED") problems.push("changes requested");
  if (pr.checks === "FAILURE" || pr.checks === "ERROR") problems.push("CI failing");
  if (pr.mergeable === "CONFLICTING") problems.push("merge conflicts");
  return problems;
}

export function project(cwd?: string | null): string {
  return cwd?.split("/").filter(Boolean).pop() ?? "~";
}
