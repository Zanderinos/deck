import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kvGet, kvSet } from "./db.js";
import { getSettings } from "./settings.js";

const exec = promisify(execFile);

// The user's open pull requests and the ones waiting on their review, kept
// warm so the agent page can answer "what needs me?" without a round trip.
// One GraphQL search per list: gh's `search prs` cannot return checks or
// mergeability.

export interface InboxPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  updatedAt: string;
  headRefName: string;
  baseRefName: string;
  /** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED or null when no review rules apply. */
  reviewDecision: string | null;
  /** MERGEABLE, CONFLICTING or UNKNOWN. */
  mergeable: string;
  /** SUCCESS, FAILURE, ERROR, PENDING, EXPECTED or NONE. */
  checks: string;
}

export interface PrInbox {
  viewer: string;
  mine: InboxPr[];
  reviewRequested: InboxPr[];
  at: number;
}

export type Attention = "changes_requested" | "ci_failed" | "conflicts";

/** Why one of the user's own PRs needs them; empty when it is just waiting. */
export function attentionReasons(pr: InboxPr): Attention[] {
  const reasons: Attention[] = [];
  if (pr.reviewDecision === "CHANGES_REQUESTED") reasons.push("changes_requested");
  if (pr.checks === "FAILURE" || pr.checks === "ERROR") reasons.push("ci_failed");
  if (pr.mergeable === "CONFLICTING") reasons.push("conflicts");
  return reasons;
}

interface SearchNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  headRefName: string;
  baseRefName: string;
  reviewDecision: string | null;
  mergeable: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
}

const QUERY = `query($q: String!) {
  viewer { login }
  search(query: $q, type: ISSUE, first: 50) {
    nodes { ... on PullRequest {
      number title url isDraft updatedAt headRefName baseRefName reviewDecision mergeable
      author { login } repository { nameWithOwner }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    } }
  }
}`;

function toPr(node: SearchNode): InboxPr {
  return {
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? "",
    isDraft: node.isDraft,
    updatedAt: node.updatedAt,
    headRefName: node.headRefName,
    baseRefName: node.baseRefName,
    reviewDecision: node.reviewDecision,
    mergeable: node.mergeable ?? "UNKNOWN",
    checks: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? "NONE",
  };
}

async function search(qualifier: string): Promise<{ viewer: string; prs: InboxPr[] }> {
  const owner = getSettings().github.owner;
  const q = `is:pr is:open archived:false ${qualifier}${owner ? ` user:${owner}` : ""}`;
  const { stdout } = await exec("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=${q}`], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const data = (JSON.parse(stdout) as { data: { viewer: { login: string }; search: { nodes: SearchNode[] } } }).data;
  return {
    viewer: data.viewer.login,
    prs: data.search.nodes.filter((n) => n.number).map(toPr).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

const CACHE_KEY = "pr_inbox";
const REFRESH_MS = 2 * 60_000;
const listeners = new Set<(inbox: PrInbox) => void>();
let timer: NodeJS.Timeout | undefined;
let inflight: Promise<PrInbox> | undefined;

export function onPrInboxChanged(cb: (inbox: PrInbox) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPrInbox(): PrInbox | undefined {
  return kvGet<PrInbox>(CACHE_KEY);
}

export function refreshPrInbox(): Promise<PrInbox> {
  inflight ??= Promise.all([search("author:@me"), search("review-requested:@me")])
    .then(([mine, requested]) => {
      const inbox: PrInbox = { viewer: mine.viewer, mine: mine.prs, reviewRequested: requested.prs, at: Date.now() };
      kvSet(CACHE_KEY, inbox);
      for (const cb of listeners) cb(inbox);
      return inbox;
    })
    .finally(() => (inflight = undefined));
  return inflight;
}

export function startPrInbox(): void {
  const tick = () => void refreshPrInbox().catch(() => {});
  tick();
  timer = setInterval(tick, REFRESH_MS);
}

export function stopPrInbox(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
