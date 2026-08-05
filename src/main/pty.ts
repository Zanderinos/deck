import { ipcMain, type WebContents } from "electron";
import pty, { type IPty } from "node-pty";
import os from "node:os";

interface Term {
  proc: IPty;
  owner: WebContents;
}

const terms = new Map<string, Term>();
let nextId = 1;

export interface TermCreateOptions {
  cwd?: string;
  /** Command to run instead of the login shell (e.g. `claude --resume <id>`). */
  command?: string;
}

export function registerPtyIpc(): void {
  ipcMain.handle("term:create", (event, opts: TermCreateOptions = {}) => {
    const id = String(nextId++);
    const shell = process.env.SHELL ?? "/bin/zsh";
    // A command still runs inside a login shell so PATH and profile apply,
    // and the tab drops back to the prompt when it exits.
    const args = opts.command ? ["-l", "-i", "-c", `${opts.command}; exec ${shell} -l`] : ["-l"];
    const proc = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: opts.cwd ?? os.homedir(),
      env: { ...process.env, TERM_PROGRAM: "deck", COLORTERM: "truecolor" },
    });

    const owner = event.sender;
    proc.onData((data) => owner.send("term:data", id, data));
    proc.onExit(({ exitCode }) => {
      terms.delete(id);
      if (!owner.isDestroyed()) owner.send("term:exit", id, exitCode);
    });

    terms.set(id, { proc, owner });
    return id;
  });

  ipcMain.on("term:input", (_e, id: string, data: string) => {
    terms.get(id)?.proc.write(data);
  });

  ipcMain.on("term:resize", (_e, id: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) terms.get(id)?.proc.resize(cols, rows);
  });

  ipcMain.on("term:kill", (_e, id: string) => {
    terms.get(id)?.proc.kill();
    terms.delete(id);
  });
}

/** Kill terminals owned by a renderer that reloaded or went away. */
export function killTermsOf(owner: WebContents): void {
  for (const [id, t] of terms) {
    if (t.owner === owner) {
      t.proc.kill();
      terms.delete(id);
    }
  }
}
