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
  /** Merge methods the repo allows, in GitHub's merge/squash/rebase order. */
  mergeMethods: ("merge" | "squash" | "rebase")[];
}

async function allowedMergeMethods(repo: string): Promise<PrDetail["mergeMethods"]> {
  try {
    const { stdout } = await exec(
      "gh",
      ["repo", "view", repo, "--json", "mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed"],
      { timeout: 20_000 },
    );
    const repoView = JSON.parse(stdout) as {
      mergeCommitAllowed: boolean;
      squashMergeAllowed: boolean;
      rebaseMergeAllowed: boolean;
    };
    const methods: PrDetail["mergeMethods"] = [];
    if (repoView.mergeCommitAllowed) methods.push("merge");
    if (repoView.squashMergeAllowed) methods.push("squash");
    if (repoView.rebaseMergeAllowed) methods.push("rebase");
    return methods.length > 0 ? methods : ["merge"];
  } catch {
    return ["merge"];
  }
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
    const [{ stdout }, mergeMethods] = await Promise.all([
      exec(
        "gh",
        ["pr", "view", String(number), "-R", repo, "--json", "title,state,reviewDecision,statusCheckRollup"],
        { timeout: 20_000 },
      ),
      allowedMergeMethods(repo),
    ]);
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
      mergeMethods,
    };
  } catch {
    return null;
  }
}

// Review feedback (Copilot and humans), adapted from slate's prComments.
// Thread comments carry the thread's anchor so they render inline in the diff;
// review-level bodies (Copilot's summary, a human's overall note) have none.
export interface PrComment {
  id: number;
  author: string;
  isBot: boolean;
  body: string;
  path: string | null;
  line: number | null;
  resolved: boolean;
  outdated: boolean;
  url: string;
  createdAt: string;
}

const COMMENTS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes { databaseId body url createdAt author { login } }
          }
        }
      }
      reviews(first: 50) {
        nodes { databaseId body url createdAt state author { login } }
      }
    }
  }
}`;

// Copilot posts this instead of a review when the requester is out of quota.
const NOISE = /unable to review this pull request|reached their quota limit/i;

const isBotLogin = (login: string): boolean => /\[bot\]$/i.test(login) || /copilot/i.test(login);

interface CommentNode {
  databaseId: number;
  body: string;
  url: string;
  createdAt: string;
  author: { login: string } | null;
}

export async function prComments(repo: string, number: number): Promise<PrComment[]> {
  const [owner, name] = repo.split("/");
  try {
    const { stdout } = await exec(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${COMMENTS_QUERY}`,
        "-F",
        `owner=${owner}`,
        "-F",
        `name=${name}`,
        "-F",
        `number=${number}`,
      ],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const pr = (
      JSON.parse(stdout) as {
        data?: {
          repository?: {
            pullRequest?: {
              reviewThreads: {
                nodes: {
                  isResolved: boolean;
                  isOutdated: boolean;
                  path: string | null;
                  line: number | null;
                  comments: { nodes: CommentNode[] };
                }[];
              };
              reviews: { nodes: (CommentNode & { state: string })[] };
            };
          };
        };
      }
    ).data?.repository?.pullRequest;
    if (!pr) return [];

    const comments: PrComment[] = [];
    for (const review of pr.reviews.nodes) {
      const body = review.body?.trim();
      if (!body || NOISE.test(body)) continue;
      const author = review.author?.login ?? "unknown";
      comments.push({
        id: review.databaseId,
        author,
        isBot: isBotLogin(author),
        body,
        path: null,
        line: null,
        resolved: false,
        outdated: false,
        url: review.url,
        createdAt: review.createdAt,
      });
    }
    for (const thread of pr.reviewThreads.nodes) {
      for (const node of thread.comments.nodes) {
        const author = node.author?.login ?? "unknown";
        comments.push({
          id: node.databaseId,
          author,
          isBot: isBotLogin(author),
          body: node.body,
          path: thread.path,
          line: thread.line,
          resolved: thread.isResolved,
          outdated: thread.isOutdated,
          url: node.url,
          createdAt: node.createdAt,
        });
      }
    }
    return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export type PrActionResult = { ok: true } | { ok: false; error: string };

const firstLine = (err: unknown): string =>
  err instanceof Error ? err.message.split("\n")[0] : "error";

export type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

/** One line comment as GitHub takes it: a range is the same shape with a start. */
export interface DraftComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number | null;
  body: string;
}

/**
 * Submits one review carrying every drafted line comment at once, which is what
 * GitHub's own review flow does: half-finished thoughts should not arrive on
 * the PR one notification at a time. Adapted from slate's submitReview.
 */
export async function submitPrReview(
  repo: string,
  number: number,
  event: ReviewEvent,
  body: string,
  comments: DraftComment[],
): Promise<PrActionResult> {
  const payload = JSON.stringify({
    event,
    body,
    comments: comments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      side: comment.side,
      // GitHub rejects a start equal to the end, so a one-line range is sent
      // as the single line it actually is.
      ...(comment.startLine && comment.startLine < comment.line
        ? { start_line: comment.startLine, start_side: comment.side }
        : {}),
      body: comment.body,
    })),
  });
  try {
    const pending = exec(
      "gh",
      ["api", "--method", "POST", `repos/${repo}/pulls/${number}/reviews`, "--input", "-"],
      { timeout: 30_000 },
    );
    pending.child.stdin?.end(payload);
    await pending;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: firstLine(err) };
  }
}

export type MergeMethod = "merge" | "squash" | "rebase";

// Guards mirror slate's merge route: refuse drafts, conflicts and red checks
// with a readable message instead of letting gh fail with a worse one.
export async function mergePr(
  repo: string,
  number: number,
  method: MergeMethod,
): Promise<PrActionResult> {
  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "view", String(number), "-R", repo, "--json", "mergeable,isDraft,statusCheckRollup"],
      { timeout: 20_000 },
    );
    const view = JSON.parse(stdout) as {
      mergeable: string;
      isDraft: boolean;
      statusCheckRollup: { status?: string; conclusion?: string }[] | null;
    };
    if (view.isDraft) {
      return { ok: false, error: "PR is still a draft; mark it ready on GitHub first." };
    }
    if (view.mergeable === "CONFLICTING") {
      return { ok: false, error: "PR has conflicts; resolve them first." };
    }
    const failing = (view.statusCheckRollup ?? []).filter(
      (check) =>
        check.status === "COMPLETED" &&
        !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion ?? ""),
    );
    if (failing.length > 0) {
      return { ok: false, error: `${failing.length} check(s) failing; nothing to merge yet.` };
    }
    await exec("gh", ["pr", "merge", String(number), "-R", repo, `--${method}`], {
      timeout: 30_000,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: firstLine(err) };
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
