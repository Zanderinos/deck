import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ launches: [] as { bin: string; args: string[]; cwd?: string }[] }));
const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/main/db.js", () => ({
  kvGet: (key: string) => (kv.has(key) ? JSON.parse(kv.get(key)!) : undefined),
  kvSet: (key: string, value: unknown) => kv.set(key, JSON.stringify(value)),
}));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => defaultSettings };
});
vi.mock("../src/main/sessions.js", () => ({ markInternalSession: vi.fn() }));
vi.mock("../src/main/github.js", () => ({
  prDiff: async () => "diff --git a/src/a.ts b/src/a.ts",
  prComments: async () => [{ id: 1, path: "src/a.ts", line: 3, body: "existing thread" }],
  prDetail: async () => ({ headRefName: "feature" }),
  fileContent: async (_repo: string, ref: string, path: string) => (path === "src/a.ts" ? `${ref}:${path}` : null),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    execFile: Object.assign(() => {}, { [promisify.custom]: async () => ({ stdout: "/mock/claude" }) }),
    spawn: (bin: string, args: string[], opts: { cwd?: string }) => {
      state.launches.push({ bin, args, cwd: opts.cwd });
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify({ type: "stream_event", event: { delta: { type: "text_delta", text: "Looks fine." } } }) + "\n");
        child.emit("close", 0);
      });
      return child;
    },
  };
});
const { handleMcp } = await import("../src/main/orchestrator.js");
const review = await import("../src/main/review.js");

const pr = { repo: "acme/api", number: 7, title: "Add retries", author: "teammate", viewer: "me", headRefName: "feature", baseRefName: "main", cwd: "/repos/api" };
const call = (name: string, args: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, review.reviewTools("acme/api", 7))
    .then((r) => (r.body as { result: { content: { text: string }[]; isError?: boolean } }).result);
const parsed = async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await call(name, args)).content[0].text);

beforeEach(() => { kv.clear(); state.launches = []; });

describe("PR review assistant", () => {
  it("keeps drafts per PR, in order, with stable ids, and tells listeners", () => {
    const seen: number[][] = [];
    const off = review.onDraftsChanged((_repo, _number, drafts) => seen.push(drafts.map((d) => d.id)));
    review.addDrafts("acme/api", 7, [{ path: "a", line: 1, side: "RIGHT", body: "one" }, { path: "b", line: 2, side: "RIGHT", body: "two" }]);
    review.removeDraft("acme/api", 7, 1);
    review.addDrafts("acme/api", 7, [{ path: "c", line: 3, side: "RIGHT", body: "three" }]);
    off();
    expect(review.getDrafts("acme/api", 7).map((d) => [d.id, d.body])).toEqual([[2, "two"], [3, "three"]]);
    expect(review.getDrafts("acme/api", 8)).toEqual([]);
    expect(seen).toEqual([[1, 2], [2], [2, 3]]);
    review.clearDrafts("acme/api", 7);
    expect(review.getDrafts("acme/api", 7)).toEqual([]);
  });
  it("serves PR-bound tools: diff, files at head, threads and draft editing", async () => {
    expect((await call("pr_diff")).content[0].text).toContain("diff --git");
    expect((await call("pr_file", { path: "src/a.ts" })).content[0].text).toContain("feature:src/a.ts");
    expect((await call("pr_file", { path: "missing.ts" })).isError).toBe(true);
    expect((await parsed("pr_comments"))[0].body).toBe("existing thread");
    const added = await parsed("add_draft_comments", { comments: [{ path: "src/a.ts", line: 12, body: "Off by one?", start_line: 10 }, { path: 3 }] });
    expect(added).toEqual([{ id: 1, path: "src/a.ts", line: 12, side: "RIGHT", startLine: 10, body: "Off by one?" }]);
    await call("update_draft", { id: 1, body: "Off by one here." });
    expect((await parsed("list_drafts"))[0].body).toBe("Off by one here.");
    await call("delete_draft", { id: 1 });
    expect(await parsed("list_drafts")).toEqual([]);
    expect((await call("add_draft_comments", { comments: [] })).isError).toBe(true);
  });
  it("runs each turn in the checkout with tools scoped to the PR and resumes the PR's own conversation", async () => {
    review.addDrafts("acme/api", 7, [{ path: "a", line: 1, side: "RIGHT", body: "one" }]);
    const events: unknown[] = [];
    expect(await review.askReview(pr, "Anything wrong here?", (e) => events.push(e), "claude")).toEqual({ ok: true, text: "Looks fine." });
    const first = state.launches[0];
    expect(first.cwd).toBe("/repos/api");
    expect(first.args[1]).toContain('PR #7 in acme/api: "Add retries" (feature → main), by teammate. The user is reviewing this PR.');
    expect(first.args[1]).toContain('"body":"one"');
    expect(first.args[first.args.indexOf("--mcp-config") + 1]).toContain("/api/mcp/review/acme/api/7");
    expect(first.args[first.args.indexOf("--allowedTools") + 1]).toContain("mcp__deck__add_draft_comments");
    expect(first.args).toContain("--session-id");
    expect(events.at(-1)).toEqual({ type: "text", text: "Looks fine." });

    await review.askReview(pr, "And the tests?", () => {}, "claude");
    const second = state.launches[1].args;
    expect(second).toContain("--resume");
    expect(second[second.indexOf("--resume") + 1]).toBe(first.args[first.args.indexOf("--session-id") + 1]);

    await review.askReview({ ...pr, number: 8, cwd: undefined }, "Other PR", () => {}, "claude");
    expect(state.launches[2].args).toContain("--session-id");
    expect(state.launches[2].cwd).not.toBe("/repos/api");

    review.resetReview("acme/api", 7);
    await review.askReview(pr, "Fresh", () => {}, "claude");
    expect(state.launches[3].args).toContain("--session-id");
    expect(review.getDrafts("acme/api", 7)).toHaveLength(1);
  });
});
