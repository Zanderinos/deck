import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ snapshot: "", environments: {} as Record<string, string>, calls: [] as string[][], failure: undefined as number | undefined }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return {
    execFile: Object.assign(() => {}, { [promisify.custom]: async (_file: string, args: string[]) => {
      state.calls.push(args);
      if (state.failure !== undefined) throw { code: state.failure };
      if (args[0] === "-axo") return { stdout: state.snapshot };
      const stdout = state.environments[args[2]];
      if (stdout === undefined) throw { code: 1 };
      return { stdout };
    } }),
  };
});

const { LegacyAgentDetector } = await import("../src/main/legacyAgentDetection.js");
const term = { id: "legacy-tab", cwd: "/repo" };

beforeEach(() => {
  state.snapshot = "100 100 100 /usr/local/bin/codex\n";
  state.environments = { "100": "codex DECK_TERM_ID=legacy-tab PATH=/usr/bin" };
  state.calls = [];
  state.failure = undefined;
});

describe("agents in surviving legacy terminal hosts", () => {
  it("detects idle Codex without host metadata or session hooks, then clears it on exit", async () => {
    const detector = new LegacyAgentDetector();
    expect(await detector.scan([term])).toEqual([{ ...term, foregroundProcess: "codex" }]);
    expect(await detector.scan([term])).toEqual([]);
    expect(state.calls.filter((args) => args[0] === "eww")).toHaveLength(1);
    state.snapshot = "";
    expect(await detector.scan([term])).toEqual([{ ...term, foregroundProcess: "" }]);
  });

  it("matches the terminal identifier and ignores background agents and shell text", async () => {
    state.snapshot += "101 101 101 codex\n102 102 999 claude\n103 103 103 /bin/zsh\n";
    state.environments["100"] = "codex DECK_TERM_ID=outside-tab";
    state.environments["101"] = "codex DECK_TERM_ID=other-tab";
    const other = { id: "other-tab", cwd: "/other" };
    expect(await new LegacyAgentDetector().scan([term, other])).toEqual([{ ...other, foregroundProcess: "codex" }]);
    expect(state.calls.filter((args) => args[0] === "eww").map((args) => args[2])).toEqual(["100", "101"]);
  });

  it("uses native host metadata when available without scanning processes", async () => {
    expect(await new LegacyAgentDetector().scan([{ ...term, foregroundProcess: "codex" }])).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("tolerates processes that exit before their terminal identifier can be read", async () => {
    state.environments = {};
    expect(await new LegacyAgentDetector().scan([term])).toEqual([]);
  });

  it("preserves detection across failed snapshots and resumes after success", async () => {
    const detector = new LegacyAgentDetector();
    await detector.scan([term]);
    state.failure = 2;
    await expect(detector.scan([term])).rejects.toEqual({ code: 2 });
    state.failure = undefined;
    expect(await detector.scan([term])).toEqual([]);
  });
});
