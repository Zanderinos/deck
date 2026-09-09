import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => defaultSettings };
});
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const pr = (number: number, title: string, head: string, base: string) => ({
    number, title, html_url: `https://github.com/acme/api/pull/${number}`,
    draft: false, updated_at: "2026-09-09T10:00:00Z", user: { login: "teammate" },
    head: { ref: head }, base: { ref: base },
  });
  return {
    execFile: Object.assign(() => {}, {
      [promisify.custom]: async (_bin: string, args: string[]) => {
        const path = args[args.length - 1];
        state.paths.push(path);
        // main <- #1 (parent-branch) <- #2 (my-branch) <- #3 (child-branch) <- #4
        if (path.includes("head=acme:parent-branch")) return { stdout: JSON.stringify([pr(1, "the parent", "parent-branch", "main")]) };
        if (path.includes("head=acme:main")) return { stdout: "[]" };
        if (path.includes("base=my-branch")) return { stdout: JSON.stringify([pr(3, "a child", "child-branch", "my-branch")]) };
        if (path.includes("base=child-branch")) return { stdout: JSON.stringify([pr(4, "a grandchild", "top-branch", "child-branch")]) };
        if (path.includes("base=top-branch")) return { stdout: "[]" };
        if (path.includes("base=lonely")) return { stdout: "[]" };
        throw new Error(`gh api ${path} failed`);
      },
    }),
  };
});
const { prStack } = await import("../src/main/github.js");

describe("branch stacks", () => {
  it("walks the whole chain in both directions, nearest first", async () => {
    const stack = await prStack("acme/api", "my-branch", "parent-branch", 2);
    expect(stack.below.map((pr) => pr.number)).toEqual([1]);
    expect(stack.above.map((pr) => pr.number)).toEqual([3, 4]);
    expect(stack.below[0]).toMatchObject({ title: "the parent", author: "teammate" });
  });

  it("asks GitHub for both directions by branch", async () => {
    state.paths.length = 0;
    await prStack("acme/api", "my-branch", "parent-branch", 2);
    expect(state.paths.some((path) => path.includes("head=acme:parent-branch"))).toBe(true);
    expect(state.paths.some((path) => path.includes("base=my-branch"))).toBe(true);
  });

  it("reports no stack for a branch off the default with nothing on top", async () => {
    expect(await prStack("acme/api", "lonely", "", 9)).toEqual({ below: [], above: [] });
  });

  it("survives a failing gh call", async () => {
    expect(await prStack("acme/api", "unknown", "unknown", 9)).toEqual({ below: [], above: [] });
  });
});
