import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { lastMessages } from "./indexer.js";
import { listSessions, markInternalSession, type AgentSession } from "./sessions.js";

const exec = promisify(execFile);

// "Ask deck": a headless Claude Code turn that answers questions about the
// agent sessions deck tracks. Every turn carries a fresh snapshot of the
// registry, so the answer is about the sessions running right now.

const SYSTEM_PROMPT = `You are deck's assistant. deck is a terminal and agent workbench that tracks every Claude Code session on this machine.
Each user message starts with a live snapshot of those sessions. Answer from the snapshot: short, concrete, markdown, no preamble.
Refer to a session by its title and project, the way the snapshot names it. Never invent a session the snapshot does not list.
When the user asks what needs attention, lead with the sessions that are waiting: for each, say what it is waiting on and what a good answer would be.`;

const TURN_TIMEOUT_MS = 180_000;
const READ_ONLY_TOOLS = "Read,Grep,Glob";

/** The conversation deck is having with the user; null until the first ask. */
let conversationId: string | undefined;

export function resetAsk(): void {
  conversationId = undefined;
}

let resolvedBin: Promise<string> | undefined;

/** A packaged app inherits a bare PATH, so claude is resolved the way the
 *  user's own shell would resolve it. */
function claudeBin(): Promise<string> {
  resolvedBin ??= exec(process.env.SHELL ?? "/bin/zsh", ["-lc", "command -v claude"], {
    timeout: 10_000,
  })
    .then(({ stdout }) => stdout.trim().split("\n").pop() || "claude")
    .catch(() => "claude");
  return resolvedBin;
}

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return "just now";
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h${m % 60}m ago`;
}

function project(cwd: string | null): string {
  return cwd?.split("/").filter(Boolean).pop() ?? "~";
}

const WAITING: AgentSession["status"][] = ["needs_input", "needs_review"];

/** The tail of a waiting session is what the user actually has to answer. */
function lastExchange(sessionId: string): string {
  return lastMessages(sessionId, 4)
    .map((m) => `    ${m.role}: ${m.text.replace(/\s+/g, " ").slice(0, 600)}`)
    .join("\n");
}

function describe(session: AgentSession, index: number): string {
  const lines = [
    `${index + 1}. "${session.title ?? "untitled"}" — ${project(session.cwd)} — status: ${session.status} — last activity ${ago(session.updated_at)}`,
    `   cwd: ${session.cwd}`,
    session.issue_key ? `   ticket: ${session.issue_key}` : "",
    session.term_id
      ? "   running in a deck terminal (the user can reply to it from deck)"
      : "   not attached to a deck terminal",
    session.review_note ? `   decisions it wants reviewed:\n${session.review_note}` : "",
  ];
  if (WAITING.includes(session.status)) {
    const tail = lastExchange(session.claude_session_id);
    if (tail) lines.push(`   last messages:\n${tail}`);
  }
  return lines.filter(Boolean).join("\n");
}

/** The snapshot of the session registry prepended to every turn. */
export function sessionSnapshot(): string {
  const sessions = listSessions().filter((s) => s.status !== "ended");
  if (sessions.length === 0) return "No agent sessions are running right now.";
  const waiting = sessions.filter((s) => WAITING.includes(s.status)).length;
  return [
    `${sessions.length} live agent session(s), ${waiting} waiting on the user. Statuses: working = busy, needs_input = asked the user something, needs_review = paused for the user to verify changes, idle = finished its turn.`,
    ...sessions.map(describe),
  ].join("\n\n");
}

export interface AskResult {
  ok: boolean;
  text: string;
  error?: string;
}

/** One conversation, so overlapping asks queue instead of resuming the same
 *  session twice at once. */
let turn: Promise<unknown> = Promise.resolve();

/** Runs one turn against the sessions snapshot, streaming text as it arrives. */
export function askDeck(question: string, onDelta: (text: string) => void): Promise<AskResult> {
  const result = turn.then(() => runTurn(question, onDelta));
  turn = result.catch(() => {});
  return result;
}

function runTurn(question: string, onDelta: (text: string) => void): Promise<AskResult> {
  const prompt = `<sessions>\n${sessionSnapshot()}\n</sessions>\n\n${question}`;
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--append-system-prompt",
    SYSTEM_PROMPT,
    // The snapshot is the context; tools are the escape hatch for digging
    // into a transcript, and nothing here may change the user's files.
    "--tools",
    READ_ONLY_TOOLS,
    "--allowedTools",
    READ_ONLY_TOOLS,
    "--strict-mcp-config",
  ];
  if (conversationId) {
    args.push("--resume", conversationId);
  } else {
    conversationId = randomUUID();
    args.push("--session-id", conversationId);
  }
  // deck's own turns fire the same hooks as any session; without this they
  // would show up in the very list they are describing.
  markInternalSession(conversationId);

  return run(args, onDelta);
}

interface StreamLine {
  type?: string;
  subtype?: string;
  result?: string;
  is_error?: boolean;
  event?: { type?: string; delta?: { type?: string; text?: string } };
}

async function run(args: string[], onDelta: (text: string) => void): Promise<AskResult> {
  const bin = await claudeBin();
  return new Promise((resolve) => {
    // Home is a neutral working directory: the question is about sessions,
    // not about whatever repo happens to be open.
    // stdin is closed, not piped: claude waits three seconds for piped input
    // before giving up on it.
    const child = spawn(bin, args, {
      cwd: os.homedir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
    let text = "";
    let stderr = "";
    let buffered = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffered += chunk;
      let nl: number;
      while ((nl = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (!line) continue;
        let msg: StreamLine;
        try {
          msg = JSON.parse(line) as StreamLine;
        } catch {
          continue;
        }
        if (msg.type === "stream_event" && msg.event?.delta?.type === "text_delta") {
          const delta = msg.event.delta.text ?? "";
          text += delta;
          onDelta(delta);
        } else if (msg.type === "result" && msg.is_error) {
          stderr = msg.result ?? stderr;
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, text: "", error: `Could not run claude: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (text.trim()) return resolve({ ok: true, text });
      resolve({
        ok: false,
        text: "",
        error: stderr.trim() || `claude exited with code ${code}`,
      });
    });
  });
}
