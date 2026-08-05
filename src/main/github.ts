import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSettings } from "./settings.js";

const exec = promisify(execFile);

// PRs via the gh CLI (the user's own auth), adapted from slate's prSearch.
// Scoped to the configured owner when set, otherwise searches all of GitHub.

export interface IssuePr {
  repo: string;
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  url: string;
  author: string;
  updatedAt: string;
}

interface GhPrRow {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  url: string;
  updatedAt: string;
  author?: { login?: string };
  repository?: { nameWithOwner?: string };
}

export async function prsForIssue(issueKey: string): Promise<IssuePr[]> {
  const owner = getSettings().github.owner;
  const args = [
    "search",
    "prs",
    issueKey,
    "--limit",
    "15",
    "--json",
    "number,title,state,isDraft,url,updatedAt,author,repository",
  ];
  if (owner) args.push("--owner", owner);
  try {
    const { stdout } = await exec("gh", args, { timeout: 20_000 });
    return (JSON.parse(stdout) as GhPrRow[])
      .map((r) => ({
        repo: r.repository?.nameWithOwner ?? "",
        number: r.number,
        title: r.title,
        state: r.state,
        isDraft: r.isDraft,
        url: r.url,
        author: r.author?.login ?? "",
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.number - a.number);
  } catch {
    return [];
  }
}

export interface PrDetail {
  title: string;
  state: string;
  reviewDecision: string | null;
  checks: { name: string; state: string }[];
}

interface GhCheckRollup {
  name?: string;
  context?: string;
  state?: string;
  conclusion?: string;
  status?: string;
}

export async function prDetail(repo: string, number: number): Promise<PrDetail | null> {
  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "view", String(number), "-R", repo, "--json", "title,state,reviewDecision,statusCheckRollup"],
      { timeout: 20_000 },
    );
    const raw = JSON.parse(stdout) as {
      title: string;
      state: string;
      reviewDecision: string | null;
      statusCheckRollup: GhCheckRollup[] | null;
    };
    return {
      title: raw.title,
      state: raw.state,
      reviewDecision: raw.reviewDecision,
      checks: (raw.statusCheckRollup ?? []).map((c) => ({
        name: c.name ?? c.context ?? "check",
        state: c.conclusion ?? c.state ?? c.status ?? "",
      })),
    };
  } catch {
    return null;
  }
}

export async function prDiff(repo: string, number: number): Promise<string> {
  try {
    const { stdout } = await exec("gh", ["pr", "diff", String(number), "-R", repo], {
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    // A pathological diff should degrade, not hang the renderer.
    return stdout.length > 2_000_000 ? stdout.slice(0, 2_000_000) : stdout;
  } catch (err) {
    return `diff unavailable: ${err instanceof Error ? err.message.split("\n")[0] : "error"}`;
  }
}
