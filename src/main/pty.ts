import { app, ipcMain, type WebContents } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { ClientMessage, HostMessage, SpawnRequest, TermMeta } from "./ptyHost.js";
import { clearTermLinks, linkTermToIssue } from "./sessions.js";
import { getSettings } from "./settings.js";

export type { TermMeta } from "./ptyHost.js";

// Terminals run in a detached pty host (ptyHost.ts) so they outlive this
// process: dev watch-restarts, ⌘R and closed windows all just reattach.

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function startCwd(requested?: string): string {
  for (const candidate of [requested, getSettings().defaultCwd]) {
    if (!candidate) continue;
    const dir = expandHome(candidate);
    if (fs.existsSync(dir)) return dir;
  }
  return os.homedir();
}

export interface TermCreateOptions {
  cwd?: string;
  /** Command to run instead of the login shell (e.g. `claude --resume <id>`). */
  command?: string;
  /** Ticket this terminal was spawned for — links its agent session. */
  issueKey?: string;
}

function spawnRequest(opts: TermCreateOptions): SpawnRequest {
  const shell = process.env.SHELL ?? "/bin/zsh";
  // Deck itself may have been launched from inside a Claude Code session
  // (dev mode); its CLAUDE* markers would make claude in this terminal
  // think it's a child session and disable transcript saving.
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => !entry[0].startsWith("CLAUDE") && entry[1] !== undefined,
    ),
  );
  return {
    shell,
    // A command still runs inside a login shell so PATH and profile apply,
    // and the tab drops back to the prompt when it exits.
    args: opts.command ? ["-l", "-i", "-c", `${opts.command}; exec ${shell} -l`] : ["-l"],
    cwd: startCwd(opts.cwd),
    env: {
      ...cleanEnv,
      // Start from the system baseline like Terminal.app, so the login
      // shell's own profile builds PATH. Inheriting an already-built PATH
      // makes "add if missing" guards in rc files skip their prepends,
      // resolving different binaries than the user's real terminal.
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      TERM_PROGRAM: "deck",
      COLORTERM: "truecolor",
    },
    command: opts.command,
    issueKey: opts.issueKey,
  };
}

type Reply = Extract<HostMessage, { req: number }>;
type Request = Extract<ClientMessage, { req: number }>;
type RequestBody = Request extends infer R ? (R extends Request ? Omit<R, "req"> : never) : never;

class PtyHostClient {
  private socket?: net.Socket;
  private connecting?: Promise<net.Socket>;
  private nextReq = 1;
  private readonly pending = new Map<number, (reply: Reply) => void>();
  /** The renderer currently showing each terminal; set on attach. */
  private readonly owners = new Map<string, WebContents>();

  private readonly socketPath = path.join(app.getPath("userData"), "pty.sock");
  private readonly logPath = path.join(app.getPath("userData"), "pty-host.log");

  async request<T extends Reply["type"]>(msg: RequestBody): Promise<Extract<Reply, { type: T }>> {
    const socket = await this.connect();
    const req = this.nextReq++;
    return new Promise((resolve) => {
      this.pending.set(req, (reply) => resolve(reply as Extract<Reply, { type: T }>));
      socket.write(JSON.stringify({ ...msg, req }) + "\n");
    });
  }

  send(msg: Exclude<ClientMessage, { req: number }>): void {
    void this.connect().then((socket) => socket.write(JSON.stringify(msg) + "\n"));
  }

  /** Attaches a renderer: it receives the replayed buffer, then live data. */
  async attach(id: string, owner: WebContents): Promise<void> {
    const { buffer } = await this.request<"attached">({ type: "attach", id });
    // Ordering holds because the host writes "attached" before any later
    // "data" for the same terminal on the one socket stream.
    this.owners.set(id, owner);
    if (buffer && !owner.isDestroyed()) owner.send("term:data", id, buffer);
  }

  private connect(): Promise<net.Socket> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket);
    this.connecting ??= this.connectOrSpawn().finally(() => (this.connecting = undefined));
    return this.connecting;
  }

  private async connectOrSpawn(): Promise<net.Socket> {
    for (let attempt = 0; ; attempt++) {
      try {
        return this.wire(await this.dial());
      } catch (err) {
        if (attempt >= 40) throw err;
        if (attempt === 0) this.spawnHost((err as NodeJS.ErrnoException).code);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  private dial(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    });
  }

  private spawnHost(reason: string | undefined): void {
    // ECONNREFUSED means the file outlived its host; a new host can't bind
    // over it.
    if (reason === "ECONNREFUSED") fs.rmSync(this.socketPath, { force: true });
    const log = fs.openSync(this.logPath, "a");
    // The Electron binary as plain Node keeps the electron-rebuilt node-pty
    // ABI-compatible; detached so our exit (or SIGKILL) never reaches it.
    const child = spawn(process.execPath, [path.join(import.meta.dirname, "ptyHost.js"), this.socketPath], {
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.unref();
    fs.closeSync(log);
  }

  private wire(socket: net.Socket): net.Socket {
    this.socket = socket;
    let buffered = "";
    socket.on("data", (chunk) => {
      buffered += chunk.toString();
      let nl: number;
      while ((nl = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (line) this.handle(JSON.parse(line) as HostMessage);
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      // Host gone: every terminal went with it.
      for (const [id, owner] of this.owners) {
        if (!owner.isDestroyed()) owner.send("term:exit", id, -1);
      }
      this.owners.clear();
      this.pending.clear();
      this.socket = undefined;
    });
    return socket;
  }

  private handle(msg: HostMessage): void {
    if ("req" in msg) {
      const resolve = this.pending.get(msg.req);
      this.pending.delete(msg.req);
      resolve?.(msg);
      return;
    }
    const owner = this.owners.get(msg.id);
    if (msg.type === "exit") this.owners.delete(msg.id);
    if (!owner || owner.isDestroyed()) return;
    if (msg.type === "data") owner.send("term:data", msg.id, msg.data);
    else owner.send("term:exit", msg.id, msg.code);
  }
}

let client: PtyHostClient | undefined;

export async function startPtyHost(): Promise<void> {
  client = new PtyHostClient();
  const { terms } = await client.request<"list">({ type: "list" });
  // Terminals that lived through the restart keep their ticket link and
  // session rows; only the ones that didn't get unlinked.
  for (const t of terms) if (t.issueKey) linkTermToIssue(t.id, t.issueKey);
  clearTermLinks(terms.map((t) => t.id));

  ipcMain.handle("term:create", async (_e, opts: TermCreateOptions = {}): Promise<TermMeta> => {
    const { meta } = await client!.request<"created">({ type: "create", spawn: spawnRequest(opts) });
    if (meta.issueKey) linkTermToIssue(meta.id, meta.issueKey);
    return meta;
  });
  ipcMain.handle("term:list", async (): Promise<TermMeta[]> => {
    return (await client!.request<"list">({ type: "list" })).terms;
  });
  ipcMain.handle("term:attach", (event, id: string) => client!.attach(id, event.sender));
  ipcMain.on("term:input", (_e, id: string, data: string) => client!.send({ type: "input", id, data }));
  ipcMain.on("term:resize", (_e, id: string, cols: number, rows: number) =>
    client!.send({ type: "resize", id, cols, rows }),
  );
  ipcMain.on("term:kill", (_e, id: string) => client!.send({ type: "kill", id }));
}

/** Packaged quit takes the shells along; in dev they stay for the restart. */
export function stopPtyHost(): void {
  if (app.isPackaged) client?.send({ type: "shutdown" });
}
