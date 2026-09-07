import type { BoardCache } from "../src/main/jira.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ board: undefined as BoardCache | undefined, configured: true, launches: [] as { bin: string; args: string[] }[] }));
vi.mock("../src/main/jira.js", () => ({ getBoardCache: () => state.board, jiraConfigured: () => state.configured }));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => ({ ...defaultSettings, jira: { ...defaultSettings.jira, baseUrl: "https://jira.example.test", apiToken: "DO-NOT-SEND-THIS-TOKEN", email: "private@example.test" } }) };
});
vi.mock("../src/main/sessions.js", () => ({ listSessions: () => [], markInternalSession: vi.fn() }));
vi.mock("../src/main/indexer.js", () => ({ lastMessages: () => [] }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    execFile: Object.assign(() => {}, { [promisify.custom]: async (_shell: string, args: string[]) => ({ stdout: args[1].includes("codex") ? "/mock/codex" : "/mock/claude" }) }),
    spawn: (bin: string, args: string[]) => {
      state.launches.push({ bin, args });
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => {
        const event = bin.endsWith("codex") ? { type: "item.completed", item: { type: "agent_message", text: "Fixture answer" } }
          : { type: "stream_event", event: { delta: { type: "text_delta", text: "Fixture answer" } } };
        child.stdout.write(JSON.stringify(event) + "\n");
        child.emit("close", 0);
      });
      return child;
    },
  };
});
const { askDeck, boardSnapshot, resetAsk } = await import("../src/main/ask.js");

beforeEach(() => {
  resetAsk();
  state.launches = [];
  state.configured = true;
  state.board = {
    boardName: "Engineering", at: Date.parse("2026-09-07T14:00:00Z"), myAccountId: "me",
    columns: [{ name: "In review", statusIds: ["qa", "review"] }],
    issues: [
      { id: "1", key: "APP-42", summary: "Fix login expiry", statusId: "qa", statusName: "Ready for QA", assignee: "Me", assigneeId: "me", updated: "2026-09-07", localMove: true },
      { id: "2", key: "APP-43", summary: "Improve keyboard navigation", statusId: "review", statusName: "Code review", assignee: "Teammate", assigneeId: "other", updated: "2026-09-07" },
    ],
  };
});

describe("Ask Deck Jira context", () => {
  it.each(["claude", "codex"] as const)("gives %s board data when no agents are running, refreshing it for each turn", async (agent) => {
    expect(await askDeck("Which of my tasks are in review?", () => {}, agent)).toMatchObject({ ok: true, text: "Fixture answer" });
    const prompt = state.launches[0].args.join("\n");
    expect(prompt).toContain("No agent sessions are running");
    expect(prompt).toContain('"key":"APP-42"');
    expect(prompt).toContain('"column":"In review"');
    expect(prompt).toContain('"assignedToMe":true');
    expect(prompt).toContain('"localOnly":true');
    expect(prompt).toContain("2026-09-07T14:00:00.000Z");
    expect(prompt).not.toContain("DO-NOT-SEND-THIS-TOKEN");
    expect(prompt).not.toContain("private@example.test");
    state.board!.issues[0].summary = "Updated task title";
    await askDeck("And now?", () => {}, agent);
    expect(state.launches[1].args.join("\n")).toContain("Updated task title");
  });
  it("distinguishes missing setup, missing sync and a successfully synced empty board", () => {
    state.board = undefined;
    expect(boardSnapshot()).toContain("no board snapshot yet");
    state.configured = false;
    expect(boardSnapshot()).toContain("not configured");
    state.board = { boardName: "Empty board", columns: [], issues: [], at: Date.now() };
    expect(JSON.parse(boardSnapshot())).toMatchObject({ board: "Empty board", ownershipKnown: false, issues: [] });
  });
  it("keeps teammate ownership distinct and handles caches without a current-user identity", () => {
    expect(JSON.parse(boardSnapshot()).issues[1].assignedToMe).toBe(false);
    delete state.board!.myAccountId;
    expect(JSON.parse(boardSnapshot()).issues[0].assignedToMe).toBeNull();
  });
});
