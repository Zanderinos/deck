import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.root } }));
state.root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-sharing-"));
vi.spyOn(os, "homedir").mockImplementation(() => state.root);
const { openDb } = await import("../src/main/db.js");
const { applyHook } = await import("../src/main/sessions.js");
const { sharingSummary, canShareProject, canShareSession, sharedSessions, setCurrentProject } = await import("../src/main/sharing.js");
const { sessionSnapshot, inboxSnapshot, boardSnapshot } = await import("../src/main/ask.js");
const { updateSettings } = await import("../src/main/settings.js");

beforeEach(() => {
  openDb().exec("DELETE FROM agent_sessions;");
  updateSettings({ agentSharing: { mode: "all", projects: [], transcripts: true, board: true, pullRequests: true } });
  setCurrentProject(undefined);
});
afterAll(() => { openDb().close(); vi.restoreAllMocks(); fs.rmSync(state.root, { recursive: true, force: true }); });

const session = (id: string, cwd: string) =>
  applyHook({ session_id: id, hook_event_name: "UserPromptSubmit", prompt: `working in ${cwd}`, cwd }, null, "claude");

const currentProjectOnly = () =>
  updateSettings({ agentSharing: { mode: "current", projects: [], transcripts: true, board: true, pullRequests: true } });

const allowlist = (projects: string[]) =>
  updateSettings({ agentSharing: { mode: "allowlist", projects, transcripts: true, board: true, pullRequests: true } });

describe("what deck may share with the agent", () => {
  it("shares everything until a project list is set", () => {
    session("a", "/work/app");
    session("b", "/private/client");
    expect(sharedSessions()).toHaveLength(2);
    expect(sharingSummary()).toEqual({ shared: 2, total: 2 });
  });

  it("withholds sessions outside the allowed projects, and says how many", () => {
    session("a", "/work/app");
    session("b", "/private/client");
    allowlist(["/work"]);
    expect(sharedSessions().map((s) => s.cwd)).toEqual(["/work/app"]);
    expect(sharingSummary()).toEqual({ shared: 1, total: 2 });
    const snapshot = sessionSnapshot();
    expect(snapshot).toContain("/work/app");
    expect(snapshot).not.toContain("/private/client");
    expect(snapshot).toContain("1 further live session(s) are not shared");
  });

  it("shares only the project the user is working in", () => {
    session("a", "/work/app");
    session("b", "/private/client");
    currentProjectOnly();
    setCurrentProject("/work/app");
    expect(sharedSessions().map((s) => s.cwd)).toEqual(["/work/app"]);
    expect(sharingSummary()).toEqual({ shared: 1, total: 2 });
  });

  it("follows the user to another project without any list to maintain", () => {
    session("a", "/work/app");
    session("b", "/private/client");
    currentProjectOnly();
    setCurrentProject("/private/client");
    expect(sharedSessions().map((s) => s.cwd)).toEqual(["/private/client"]);
  });

  it("shares nothing while no project is open", () => {
    session("a", "/work/app");
    currentProjectOnly();
    expect(sharedSessions()).toEqual([]);
    expect(sharingSummary()).toEqual({ shared: 0, total: 1 });
  });

  it("matches whole path segments, so a sibling directory is not allowed by prefix", () => {
    allowlist(["/work"]);
    expect(canShareProject("/work")).toBe(true);
    expect(canShareProject("/work/app/packages/ui")).toBe(true);
    expect(canShareProject("/workspace/other")).toBe(false);
  });

  it("expands ~ in an allowed project", () => {
    allowlist(["~/allowed"]);
    expect(canShareProject(path.join(state.root, "allowed", "repo"))).toBe(true);
    expect(canShareProject(path.join(state.root, "elsewhere"))).toBe(false);
  });

  it("refuses to read the transcript of a withheld or unknown session", () => {
    session("a", "/work/app");
    session("b", "/private/client");
    allowlist(["/work"]);
    expect(canShareSession("a")).toBe(true);
    expect(canShareSession("b")).toBe(false);
    expect(canShareSession("never-seen")).toBe(false);
  });

  it("withholds the pull request inbox when that is switched off", () => {
    updateSettings({ agentSharing: { mode: "all", projects: [], transcripts: true, board: true, pullRequests: false } });
    expect(inboxSnapshot()).toContain("restricted what deck shares");
  });

  it("withholds the issue board when that is switched off", () => {
    updateSettings({ agentSharing: { mode: "all", projects: [], transcripts: true, board: false, pullRequests: true } });
    expect(boardSnapshot()).toContain("restricted what deck shares");
  });
});
