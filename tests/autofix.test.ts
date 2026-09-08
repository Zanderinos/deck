import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxPr, PrInbox } from "../src/main/prInbox.js";

const state = vi.hoisted(() => ({
  created: [] as { cwd?: string; agent?: string; prompt?: string }[],
  push: "review" as "review" | "push",
  inboxListeners: [] as ((inbox: PrInbox) => void)[],
  exitListeners: [] as ((id: string) => void)[],
  kv: undefined as Record<string, string> | undefined,
  sessions: [] as { status: string; term_id: string | null; title: string | null }[],
}));
vi.mock("../src/main/sessions.js", () => ({ listSessions: () => state.sessions }));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => ({ ...defaultSettings, autoFix: { ...defaultSettings.autoFix, push: state.push } }) };
});
vi.mock("../src/main/db.js", () => ({ kvGet: () => state.kv, kvSet: (_key: string, value: Record<string, string>) => { state.kv = value; } }));
vi.mock("../src/main/providers.js", () => ({ listRepos: () => [{ name: "api", path: "/repos/api" }, { name: "web", path: "/repos/Web" }] }));
vi.mock("../src/main/pty.js", () => ({
  createTerm: async (opts: { cwd?: string; agent?: string; prompt?: string }) => { state.created.push(opts); return { id: `t${state.created.length}`, cwd: opts.cwd }; },
  onTermExit: (cb: (id: string) => void) => { state.exitListeners.push(cb); return () => {}; },
}));
vi.mock("../src/main/prInbox.js", async () => {
  const actual = await import("../src/main/prInbox.js");
  return { ...actual, onPrInboxChanged: (cb: (inbox: PrInbox) => void) => { state.inboxListeners.push(cb); return () => {}; } };
});
const { checkoutFor, fixPrompt, pendingAutoFixes, runningFixes, startAutoFix, startFix } = await import("../src/main/autofix.js");

const pr = (number: number, extra: Partial<InboxPr> = {}): InboxPr => ({
  repo: "acme/api", number, title: `PR ${number}`, url: "", author: "me", isDraft: false, updatedAt: "2026-09-07T10:00:00Z",
  headRefName: `feature-${number}`, baseRefName: "main", reviewDecision: null, mergeable: "MERGEABLE", checks: "SUCCESS", ...extra,
});
const inbox = (mine: InboxPr[]): PrInbox => ({ viewer: "me", at: 0, mine, reviewRequested: [] });
const settings = { enabled: true, ci: true, conflicts: true, push: "review" as const };

beforeEach(() => { state.created = []; state.push = "review"; state.sessions = []; });

describe("auto-fix", () => {
  it("finds checkouts by directory name, case-insensitively", () => {
    expect(checkoutFor("acme/api")).toBe("/repos/api");
    expect(checkoutFor("web")).toBe("/repos/Web");
    expect(checkoutFor("acme/missing")).toBeUndefined();
  });
  it("gates the push on review unless configured otherwise", () => {
    expect(fixPrompt(pr(1), "ci_failed")).toContain("do not push until I confirm");
    expect(fixPrompt(pr(1), "conflicts")).toContain("Merge origin/main");
    state.push = "push";
    expect(fixPrompt(pr(1), "changes_requested")).toContain("push to the PR branch");
  });
  it("picks only enabled problems on non-draft PRs that have not been fixed for this push", async () => {
    const failing = pr(1, { checks: "FAILURE" });
    const conflicting = pr(2, { mergeable: "CONFLICTING", reviewDecision: "CHANGES_REQUESTED" });
    const draft = pr(3, { checks: "FAILURE", isDraft: true });
    expect(pendingAutoFixes(inbox([failing, conflicting, draft, pr(4)]), settings).map((f) => `${f.pr.number}:${f.problem}`)).toEqual(["1:ci_failed", "2:conflicts"]);
    expect(pendingAutoFixes(inbox([failing, conflicting]), { ...settings, ci: false })).toHaveLength(1);
    expect(pendingAutoFixes(inbox([failing]), { ...settings, enabled: false })).toEqual([]);

    const fix = await startFix(failing, "ci_failed");
    expect(fix).toMatchObject({ repo: "acme/api", number: 1, problem: "ci_failed", termId: "t1" });
    expect(state.created[0]).toMatchObject({ cwd: "/repos/api", agent: "claude" });
    expect(await startFix(failing, "ci_failed")).toBe(fix);
    expect(state.created).toHaveLength(1);
    expect(pendingAutoFixes(inbox([failing]), settings)).toEqual([]);

    state.exitListeners.forEach((cb) => cb("t1"));
    startAutoFix();
    state.exitListeners.forEach((cb) => cb("t1"));
    expect(runningFixes()).toEqual([]);
    expect(pendingAutoFixes(inbox([failing]), settings)).toEqual([]);
    expect(pendingAutoFixes(inbox([{ ...failing, updatedAt: "2026-09-07T11:00:00Z" }]), settings)).toHaveLength(1);
  });
  it("starts one agent when two refreshes race on the same problem, and remembers it across launches", async () => {
    const conflicting = pr(5, { mergeable: "CONFLICTING" });
    const [a, b] = await Promise.all([startFix(conflicting, "conflicts"), startFix(conflicting, "conflicts")]);
    expect(a).toBe(b);
    expect(state.created).toHaveLength(1);
    expect(state.kv).toMatchObject({ "acme/api#5:conflicts": conflicting.updatedAt });
  });
  it("leaves a PR alone while a fix agent from before a restart is still alive in a terminal", () => {
    const conflicting = pr(7, { mergeable: "CONFLICTING" });
    state.sessions = [{ status: "working", term_id: "t1", title: fixPrompt(conflicting, "conflicts").slice(0, 120) }];
    expect(pendingAutoFixes(inbox([conflicting]), settings)).toEqual([]);
    state.sessions = [{ status: "ended", term_id: null, title: fixPrompt(conflicting, "conflicts").slice(0, 120) }];
    expect(pendingAutoFixes(inbox([conflicting]), settings)).toHaveLength(1);
  });
  it("is off until the user opts in", async () => {
    const { defaultSettings } = await import("../src/shared/settings.js");
    expect(defaultSettings.autoFix.enabled).toBe(false);
    expect(pendingAutoFixes(inbox([pr(6, { checks: "FAILURE" })]), defaultSettings.autoFix)).toEqual([]);
  });
  it("refuses PRs without a local checkout", async () => {
    await expect(startFix(pr(9, { repo: "acme/missing" }), "conflicts")).rejects.toThrow("No local checkout");
  });
});
