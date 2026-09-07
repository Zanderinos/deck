import path from "node:path";
import type { Agent } from "../shared/agents.js";
import { attentionReasons, onPrInboxChanged, type Attention, type InboxPr, type PrInbox } from "./prInbox.js";
import { listRepos } from "./providers.js";
import { createTerm, onTermExit } from "./pty.js";
import { getSettings } from "./settings.js";

// Agents that repair the user's own PRs: failing CI and merge conflicts start
// one automatically (per settings); the agent page can also ask for one, and
// for addressing requested changes.

export type FixProblem = Attention;

export interface Fix {
  repo: string;
  number: number;
  problem: FixProblem;
  termId: string;
  startedAt: number;
}

const running = new Map<string, Fix>();
/** PR head state each problem was last fixed for, so a fix runs once per push. */
const handled = new Map<string, string>();

const fixKey = (repo: string, number: number, problem: FixProblem) => `${repo}#${number}:${problem}`;

/** The local checkout for a GitHub repo, by directory name under the repo roots. */
export function checkoutFor(repo: string): string | undefined {
  const name = repo.split("/").pop()?.toLowerCase();
  return listRepos().find((r) => path.basename(r.path).toLowerCase() === name)?.path;
}

function pushInstruction(): string {
  return getSettings().autoFix.push === "push"
    ? "Commit in one line without agent authorship and push to the PR branch."
    : "Commit in one line without agent authorship, then stop and show me the diff before pushing; do not push until I confirm.";
}

export function fixPrompt(pr: InboxPr, problem: FixProblem): string {
  const head = `PR #${pr.number} in ${pr.repo} — "${pr.title}" (branch ${pr.headRefName} → ${pr.baseRefName}).`;
  const checkout = `This checkout is the PR's repository: fetch, check out ${pr.headRefName} if not already on it, and never touch other branches.`;
  const task = {
    ci_failed: `CI is failing on it. Find the failing run with \`gh pr checks ${pr.number}\` and \`gh run view --log-failed\`, reproduce locally, fix the root cause (do not skip or loosen tests), and run the project's checks.`,
    conflicts: `It has merge conflicts with ${pr.baseRefName}. Merge origin/${pr.baseRefName} into the branch, resolve every conflict keeping both intents, run the project's checks.`,
    changes_requested: `A reviewer requested changes. Read the unresolved threads with \`gh api repos/${pr.repo}/pulls/${pr.number}/comments\` and \`gh pr view ${pr.number} --comments\`, address each one, run the project's checks.`,
  }[problem];
  return `${head} ${checkout} ${task} ${pushInstruction()}`;
}

export function runningFixes(): Fix[] {
  return [...running.values()];
}

/** Starts an agent on a PR problem; returns the existing fix when one is already on it. */
export async function startFix(pr: InboxPr, problem: FixProblem, agent: Agent = getSettings().defaultAgent): Promise<Fix> {
  const key = fixKey(pr.repo, pr.number, problem);
  const current = running.get(key);
  if (current) return current;
  const cwd = checkoutFor(pr.repo);
  if (!cwd) throw new Error(`No local checkout of ${pr.repo} under the configured repo roots`);
  const meta = await createTerm({ cwd, agent, prompt: fixPrompt(pr, problem) });
  const fix: Fix = { repo: pr.repo, number: pr.number, problem, termId: meta.id, startedAt: Date.now() };
  running.set(key, fix);
  handled.set(key, pr.updatedAt);
  return fix;
}


/** Which automatic fixes an inbox refresh should start, given what already ran. */
export function pendingAutoFixes(inbox: PrInbox, settings = getSettings().autoFix): { pr: InboxPr; problem: FixProblem }[] {
  if (!settings.enabled) return [];
  const wanted: FixProblem[] = [...(settings.ci ? ["ci_failed" as const] : []), ...(settings.conflicts ? ["conflicts" as const] : [])];
  return inbox.mine
    .filter((pr) => !pr.isDraft)
    .flatMap((pr) => attentionReasons(pr).filter((p) => wanted.includes(p)).map((problem) => ({ pr, problem })))
    .filter(({ pr, problem }) => {
      const key = fixKey(pr.repo, pr.number, problem);
      return !running.has(key) && handled.get(key) !== pr.updatedAt;
    });
}

export function startAutoFix(): void {
  onTermExit((termId) => {
    for (const [key, fix] of running) if (fix.termId === termId) running.delete(key);
  });
  onPrInboxChanged((inbox) => {
    for (const { pr, problem } of pendingAutoFixes(inbox)) {
      // Missing checkouts stay pending; the agent page reports them.
      void startFix(pr, problem).catch(() => {});
    }
  });
}
