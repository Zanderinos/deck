import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { DraftComment } from "./github.js";
import { handleMcp, type JsonRpc } from "./orchestrator.js";
import { applyHook, requestReview, type HookPayload } from "./sessions.js";

// deck's local HTTP surface. Claude Code hooks curl into it; later slices add
// search and board APIs. Loopback only.

export const SERVER_PORT = 47800;

let server: ServerType | undefined;

const draftListeners = new Set<(termId: string, drafts: DraftComment[]) => void>();

/** Fires when an agent in a deck terminal hands back review comments for a PR. */
export function onPrDrafts(cb: (termId: string, drafts: DraftComment[]) => void): () => void {
  draftListeners.add(cb);
  return () => draftListeners.delete(cb);
}

const isDraft = (d: unknown): d is DraftComment =>
  typeof d === "object" &&
  d !== null &&
  typeof (d as DraftComment).path === "string" &&
  Number.isInteger((d as DraftComment).line) &&
  typeof (d as DraftComment).body === "string";

function buildApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/hook", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as HookPayload;
    applyHook(payload, c.req.header("x-deck-term") || null, c.req.header("x-deck-agent") === "codex" ? "codex" : "claude");
    return c.json({ ok: true });
  });

  // The deck-review skill posts the agent's decisions summary as plain text
  // when it pauses for user verification before pushing.
  app.post("/api/review", async (c) => {
    const term = c.req.header("x-deck-term");
    const note = (await c.req.text().catch(() => "")).trim();
    if (term && note) requestReview(term, note);
    return c.json({ ok: Boolean(term && note) });
  });

  // The PR agent panel asks its Claude session to post review comments here;
  // they land as drafts in the review screen instead of going to GitHub.
  app.post("/api/pr-drafts", async (c) => {
    const term = c.req.header("x-deck-term");
    const body = (await c.req.json().catch(() => null)) as unknown;
    const drafts: DraftComment[] = Array.isArray(body)
      ? body.filter(isDraft).map((d) => ({ ...d, side: d.side === "LEFT" ? "LEFT" : "RIGHT" }))
      : [];
    if (term && drafts.length > 0) for (const cb of draftListeners) cb(term, drafts);
    return c.json({ ok: Boolean(term), accepted: drafts.length });
  });

  // The agent page's assistant reaches deck's tools here (MCP over HTTP with
  // plain JSON responses). Loopback only, like everything else on this server.
  app.post("/api/mcp", async (c) => {
    const message = (await c.req.json().catch(() => null)) as JsonRpc | null;
    if (!message?.method) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    const { status, body } = await handleMcp(message);
    return body === undefined ? c.body(null, 202) : c.json(body, status as 200);
  });
  app.get("/api/mcp", (c) => c.body(null, 405));
  app.delete("/api/mcp", (c) => c.body(null, 200));

  return app;
}

export const MCP_URL = `http://127.0.0.1:${SERVER_PORT}/api/mcp`;

export function startServer(attempt = 0): void {
  const app = buildApp();
  server = serve({ fetch: app.fetch, port: SERVER_PORT, hostname: "127.0.0.1" });
  // Dev watch-restarts overlap with the old instance for a moment; retry
  // until the previous process releases the port.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      server?.close();
      setTimeout(() => startServer(attempt + 1), 500);
    }
  });
}

export function stopServer(): void {
  server?.close();
  server = undefined;
}
