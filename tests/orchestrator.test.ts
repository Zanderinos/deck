import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ created: [] as unknown[], sent: [] as unknown[] }));
vi.mock("../src/main/autofix.js", () => ({ checkoutFor: (repo: string) => (repo.endsWith("api") ? "/repos/api" : undefined), fixPrompt: () => "fix", runningFixes: () => [], startFix: vi.fn() }));
vi.mock("../src/main/github.js", () => ({ prDetail: async () => null }));
vi.mock("../src/main/indexer.js", () => ({ lastMessages: (id: string, limit: number) => [{ role: "assistant", text: `${id} ${limit}`, ts: 0 }] }));
vi.mock("../src/main/board/board.js", () => ({ createIssue: vi.fn(), getBoardCache: () => ({ issues: [{ key: "APP-1" }, { key: "APP-2" }, { key: "OPS-9" }, { key: "api#12" }] }), searchIssues: async (query: string) => [{ key: "APP-5", summary: query }] }));
vi.mock("../src/main/board/provider.js", () => ({ boardProvider: () => ({ label: "Jira" }) }));
vi.mock("../src/main/prInbox.js", async () => ({ ...(await import("../src/main/prInbox.js")), getPrInbox: () => undefined, refreshPrInbox: vi.fn() }));
vi.mock("../src/main/providers.js", () => ({ listRepos: () => [{ name: "api", path: "/repos/api" }] }));
vi.mock("../src/main/pty.js", () => ({
  createTerm: async (opts: unknown) => { state.created.push(opts); return { id: "t9" }; },
  sendToTerm: (id: string, text: string) => state.sent.push({ id, text }),
}));
vi.mock("../src/main/settings.js", async () => {
  const { defaultSettings } = await import("../src/shared/settings.js");
  return { getSettings: () => defaultSettings };
});
vi.mock("../src/main/sessions.js", () => ({
  listSessions: () => [
    { session_id: "s1", agent: "claude", cwd: "/repos/api", status: "needs_input", term_id: "t1" },
    { session_id: "s2", agent: "codex", cwd: "/repos/api", status: "idle", term_id: null },
    { session_id: "s3", agent: "codex", cwd: "/repos/api", status: "ended", term_id: null },
  ],
}));
const { boardProjects, handleMcp, toolNames } = await import("../src/main/orchestrator.js");

const call = (name: string, args: Record<string, unknown> = {}) => handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const text = (r: Awaited<ReturnType<typeof handleMcp>>) => (r.body as { result: { content: { text: string }[]; isError?: boolean } }).result;

describe("deck MCP server", () => {
  it("speaks enough MCP for the CLIs: initialize, notifications, ping, tools/list", async () => {
    const init = await handleMcp({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(init.body).toMatchObject({ id: 0, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "deck" } } });
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({ status: 202 });
    expect((await handleMcp({ jsonrpc: "2.0", id: 2, method: "ping" })).body).toMatchObject({ result: {} });
    const list = (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/list" })).body as { result: { tools: { name: string; inputSchema: { required?: string[] } }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(toolNames());
    expect(list.result.tools.find((t) => t.name === "start_agent")?.inputSchema.required).toEqual(["prompt"]);
    expect((await handleMcp({ jsonrpc: "2.0", id: 4, method: "resources/list" })).body).toMatchObject({ error: { code: -32601 } });
  });
  it("lists live sessions and reads transcripts", async () => {
    expect(JSON.parse(text(await call("list_sessions")).content[0].text).map((s: { session_id: string }) => s.session_id)).toEqual(["s1", "s2"]);
    expect(text(await call("read_session", { session_id: "s1", limit: 5 })).content[0].text).toContain("s1 5");
  });
  it("sends to sessions only when they run in a deck terminal", async () => {
    expect(text(await call("send_to_session", { session_id: "s1", text: "yes" })).isError).toBeUndefined();
    expect(state.sent).toEqual([{ id: "t1", text: "yes" }]);
    expect(text(await call("send_to_session", { session_id: "s2", text: "yes" }))).toMatchObject({ isError: true });
  });
  it("starts agents in a known checkout", async () => {
    const started = text(await call("start_agent", { repo: "acme/api", prompt: "Fix APP-5", issue_key: "APP-5", agent: "codex" }));
    expect(JSON.parse(started.content[0].text)).toEqual({ term_id: "t9", cwd: "/repos/api", agent: "codex" });
    expect(state.created[0]).toEqual({ cwd: "/repos/api", agent: "codex", prompt: "Fix APP-5", issueKey: "APP-5" });
    const missing = text(await call("start_agent", { repo: "nowhere", prompt: "x" }));
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("list_repos");
  });
  it("reports unknown tools and searches the tracker", async () => {
    expect((await call("nope")).body).toMatchObject({ error: { code: -32602 } });
    expect(text(await call("search_issues", { query: "project = APP" })).content[0].text).toContain("project = APP");
    expect(text(await call("pr_inbox")).content[0].text).toContain("No PR data yet");
    expect(boardProjects()).toEqual(["APP", "OPS", "api"]);
  });
});
