import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as string[], stored: undefined as unknown }));
vi.mock("../src/main/db.js", () => ({ kvGet: () => state.stored, kvSet: (_k: string, v: unknown) => (state.stored = v) }));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => ({ ...defaultSettings, github: { owner: "acme" } }) };
});
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const node = (number: number, extra: Record<string, unknown>) => ({
    number, title: `PR ${number}`, url: `https://github.com/acme/api/pull/${number}`, isDraft: false, updatedAt: `2026-09-0${number}T10:00:00Z`,
    headRefName: "f", baseRefName: "main", reviewDecision: null, mergeable: "MERGEABLE", author: { login: "me" }, repository: { nameWithOwner: "acme/api" },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] }, ...extra,
  });
  return {
    execFile: Object.assign(() => {}, {
      [promisify.custom]: async (_bin: string, args: string[]) => {
        const q = args[args.indexOf("-f", 3) + 1];
        state.queries.push(q);
        const nodes = q.includes("author:@me")
          ? [node(1, { commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] } }), node(2, { mergeable: "CONFLICTING", reviewDecision: "CHANGES_REQUESTED" }), node(3, { commits: { nodes: [] } })]
          : [node(4, { author: { login: "teammate" } })];
        return { stdout: JSON.stringify({ data: { viewer: { login: "me" }, search: { nodes } } }) };
      },
    }),
  };
});
const { attentionReasons, refreshPrInbox, getPrInbox, onPrInboxChanged } = await import("../src/main/prInbox.js");

describe("PR inbox", () => {
  it("fetches my PRs and review requests scoped to the owner, caches and notifies", async () => {
    const seen: unknown[] = [];
    onPrInboxChanged((inbox) => seen.push(inbox));
    const inbox = await refreshPrInbox();
    expect(state.queries).toEqual(["q=is:pr is:open archived:false author:@me user:acme", "q=is:pr is:open archived:false review-requested:@me user:acme"]);
    expect(inbox.viewer).toBe("me");
    expect(inbox.mine.map((p) => p.number)).toEqual([3, 2, 1]);
    expect(inbox.mine.find((p) => p.number === 3)?.checks).toBe("NONE");
    expect(inbox.reviewRequested[0]).toMatchObject({ number: 4, author: "teammate" });
    expect(getPrInbox()).toEqual(inbox);
    expect(seen).toEqual([inbox]);
  });
  it("names what needs the author's attention", async () => {
    const inbox = await refreshPrInbox();
    const by = (n: number) => attentionReasons(inbox.mine.find((p) => p.number === n)!);
    expect(by(1)).toEqual(["ci_failed"]);
    expect(by(2)).toEqual(["changes_requested", "conflicts"]);
    expect(by(3)).toEqual([]);
  });
});
