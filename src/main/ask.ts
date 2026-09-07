import { type Agent } from "../shared/agents.js";
import { getSettings } from "./settings.js";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { lastMessages } from "./indexer.js";
import { listSessions, markInternalSession, type AgentSession } from "./sessions.js";

const exec = promisify(execFile);

// "Ask deck": a headless agent turn that answers questions about the
// agent sessions deck tracks. Every turn carries a fresh snapshot of the
// registry, so the answer is about the sessions running right now.

const SYSTEM_PROMPT = `You are deck's assistant. deck is a terminal and agent workbench that tracks Claude Code and Codex sessions on this machine.
Each user message starts with a live snapshot of those sessions. Answer from the snapshot: short, concrete, markdown, no preamble.
Refer to a session by its title and project, the way the snapshot names it. Never invent a session the snapshot does not list.
When the user asks what needs attention, lead with the sessions that are waiting: for each, say what it is waiting on and what a good answer would be.`;

const TURN_TIMEOUT_MS = 180_000;
const READ_ONLY_TOOLS = "Read,Grep,Glob";

/** The conversation deck is having with the user; null until the first ask. */
let conversationId: string | undefined;
let codexHistory: string[] = [];

export function resetAsk(): void {
  conversationId = undefined;
  codexHistory = [];
}

const resolvedBins = new Map<Agent, Promise<string>>();

/** A packaged app inherits a bare PATH, so claude is resolved the way the
 *  user's own shell would resolve it. */
function agentBin(agent: Agent): Promise<string> {
  let resolved = resolvedBins.get(agent);
  if (!resolved) {
    resolved = exec(process.env.SHELL ?? "/bin/zsh", ["-lc", `command -v ${agent}`], { timeout: 10_000 })
      .then(({ stdout }) => stdout.trim().split("\n").pop() || agent).catch(() => agent);
    resolvedBins.set(agent, resolved);
  }
  return resolved;
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
    `${index + 1}. "${session.title ?? "untitled"}" — ${project(session.cwd)} — ${session.agent} — status: ${session.status} — last activity ${ago(session.updated_at)}`,
    `   cwd: ${session.cwd}`,
    session.issue_key ? `   ticket: ${session.issue_key}` : "",
    session.term_id
      ? "   running in a deck terminal (the user can reply to it from deck)"
      : "   not attached to a deck terminal",
    session.review_note ? `   decisions it wants reviewed:\n${session.review_note}` : "",
  ];
  if (WAITING.includes(session.status)) {
    const tail = lastExchange(session.session_id);
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
export function askDeck(question: string, onDelta: (text: string) => void, agent: Agent = getSettings().defaultAgent): Promise<AskResult> {
  const result = turn.then(() => agent === "codex" ? runCodexTurn(question, onDelta) : runTurn(question, onDelta));
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

  return run(args, onDelta, "claude");
}

async function runCodexTurn(question: string, onDelta: (text: string) => void): Promise<AskResult> {
  const prompt = `${SYSTEM_PROMPT}\n\n${codexHistory.join("\n\n")}\n\n<sessions>\n${sessionSnapshot()}\n</sessions>\n\nuser: ${question}`;
  const result = await run(["exec", "--json", "--ephemeral", "--ignore-user-config", "--sandbox", "read-only",
    "--config", 'approval_policy="never"', "--config", "features.hooks=false", "--skip-git-repo-check", "--", prompt], onDelta, "codex");
  if (result.ok) codexHistory = [...codexHistory, `user: ${question}`, `assistant: ${result.text}`].slice(-20);
  return result;
}

interface StreamLine {
  type?: string;
  subtype?: string;
  result?: string;
  is_error?: boolean;
  item?: { type?: string; text?: string };
  error?: { message?: string };
  message?: string;
  event?: { type?: string; delta?: { type?: string; text?: string } };
}

async function run(args: string[], onDelta: (text: string) => void, agent: Agent): Promise<AskResult> {
  const bin = await agentBin(agent);
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
    let failed = false;
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
        if (agent === "codex" && msg.type === "item.completed" && msg.item?.type === "agent_message") {
          const delta = (text ? "\n\n" : "") + (msg.item.text ?? "");
          text += delta;
          onDelta(delta);
        } else if (agent === "codex" && (msg.type === "turn.failed" || msg.type === "error")) {
          failed = true;
          stderr = msg.error?.message ?? msg.message ?? "Codex turn failed";
        } else if (msg.type === "stream_event" && msg.event?.delta?.type === "text_delta") {
          const delta = msg.event.delta.text ?? "";
          text += delta;
          onDelta(delta);
        } else if (msg.type === "result" && msg.is_error) {
          failed = true;
          stderr = msg.result ?? stderr;
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, text: "", error: `Could not run ${agent}: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (text.trim() && code === 0 && !failed) return resolve({ ok: true, text });
      resolve({
        ok: false,
        text,
        error: stderr.trim() || `${agent} exited with code ${code}`,
      });
    });
  });
}
