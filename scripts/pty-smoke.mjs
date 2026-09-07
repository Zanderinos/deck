import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
import electron from "electron";

const directory = await mkdtemp(path.join(os.tmpdir(), "deck-pty-"));
const socketPath = path.join(directory, "host.sock");
const host = spawn(electron, ["out/main/ptyHost.js", socketPath], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
host.stderr.pipe(process.stderr);
let socket;
const timeout = setTimeout(() => { console.error("PTY smoke timed out"); host.kill(); process.exitCode = 1; socket?.destroy(); }, 10000);
try {
  await Promise.race([once(host.stdout, "data"), once(host, "exit").then(() => { throw Error("PTY host exited before listening"); })]);
  socket = net.createConnection(socketPath);
  await once(socket, "connect");
  const messages = [];
  let buffered = "";
  socket.on("data", (chunk) => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      messages.push(JSON.parse(buffered.slice(0, newline)));
      buffered = buffered.slice(newline + 1);
    }
  });
  const send = (message) => socket.write(JSON.stringify(message) + "\n");
  const receive = async (predicate) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      if (host.exitCode !== null) throw Error("PTY host exited");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Missing PTY reply");
  };
  // A deterministic shell process exercises PTY creation, metadata, input,
  // streaming and replay without starting an agent or reading user profiles.
  send({ type: "create", req: 1, spawn: { shell: "/bin/sh", args: ["-c", 'printf "ready:%s\\n" "$DECK_TERM_ID"; exec /bin/cat'], cwd: directory, env: { PATH: "/usr/bin:/bin", TERM: "xterm-256color" }, agent: "codex", sessionId: "codex:fixture" } });
  const { meta } = await receive((message) => message.type === "created");
  assert.equal(meta.agent, "codex");
  assert.equal(meta.sessionId, "codex:fixture");
  await receive((message) => message.type === "data" && message.data.includes(`ready:${meta.id}`));
  send({ type: "input", id: meta.id, data: "roundtrip\n" });
  await receive((message) => message.type === "data" && message.data.includes("roundtrip"));
  send({ type: "attach", req: 2, id: meta.id });
  const replay = await receive((message) => message.type === "attached");
  assert.ok(replay.buffer.includes(`ready:${meta.id}`));
  assert.ok(replay.buffer.includes("roundtrip"));
  send({ type: "list", req: 3 });
  assert.deepEqual((await receive((message) => message.type === "list")).terms, [meta]);
  send({ type: "kill", id: meta.id });
  await receive((message) => message.type === "exit");
  console.log("PTY smoke passed: native shell, provider metadata, input/output, replay, restore list and termination.");
} finally {
  clearTimeout(timeout);
  socket?.destroy();
  host.kill();
  await rm(directory, { recursive: true, force: true });
}
