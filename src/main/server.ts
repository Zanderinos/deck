import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { applyHook, type HookPayload } from "./sessions.js";

// deck's local HTTP surface. Claude Code hooks curl into it; later slices add
// search and board APIs. Loopback only.

export const SERVER_PORT = 47800;

let server: ServerType | undefined;

export function startServer(): void {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/hook", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as HookPayload;
    applyHook(payload, c.req.header("x-deck-term") || null);
    return c.json({ ok: true });
  });

  server = serve({ fetch: app.fetch, port: SERVER_PORT, hostname: "127.0.0.1" });
}

export function stopServer(): void {
  server?.close();
  server = undefined;
}
