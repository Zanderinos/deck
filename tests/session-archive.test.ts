import { describe, expect, it } from "vitest";
import type { AgentSession } from "../src/main/sessions.js";
import { archiveGroups } from "../src/renderer/src/lib/sessionArchive.js";

const now = new Date("2026-09-09T12:00:00Z").getTime();
const day = 86_400_000;

const session = (id: string, updatedAt: number, extra: Partial<AgentSession> = {}): AgentSession => ({
  session_id: id, agent: "claude", cwd: "/Users/me/www/deck", title: id, status: "ended", term_id: null,
  transcript_path: null, issue_key: null, review_note: null, started_at: updatedAt, updated_at: updatedAt, ...extra,
});

describe("archiveGroups", () => {
  it("groups by day, newest first", () => {
    const groups = archiveGroups([
      session("older", now - 40 * day), session("today", now - 3600_000),
      session("yesterday", now - day), session("week", now - 3 * day), session("month", now - 12 * day),
    ], "", now);
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "This week", "This month", "Earlier"]);
    expect(groups.flatMap((group) => group.sessions.map((s) => s.session_id))).toEqual(["today", "yesterday", "week", "month", "older"]);
  });

  it("keeps one group per day bucket rather than one per session", () => {
    const groups = archiveGroups([session("a", now), session("b", now - 3600_000)], "", now);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
  });

  it("drops sessions that have nothing to resume yet", () => {
    expect(archiveGroups([session("pending:1", now)], "", now)).toEqual([]);
  });

  it("matches on title, path, agent and issue key", () => {
    const sessions = [session("a", now, { title: "Fix pagination", issue_key: "INI-6453" }), session("b", now, { title: "Other", cwd: "/Users/me/www/postfab-backend" })];
    expect(archiveGroups(sessions, "pagin", now)[0].sessions.map((s) => s.session_id)).toEqual(["a"]);
    expect(archiveGroups(sessions, "ini-6453", now)[0].sessions.map((s) => s.session_id)).toEqual(["a"]);
    expect(archiveGroups(sessions, "postfab", now)[0].sessions.map((s) => s.session_id)).toEqual(["b"]);
    expect(archiveGroups(sessions, "codex", now)).toEqual([]);
  });
});
