import { watch, type FSWatcher } from "chokidar";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { openDb } from "./db.js";

// Incremental full-text index over Claude Code transcripts
// (~/.claude/projects/<munged-cwd>/<sessionId>.jsonl). Transcripts are
// append-only, so each file is resumed from the last indexed byte offset.

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

interface TranscriptLine {
  type?: string;
  isSidechain?: boolean;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  summary?: string;
  leafUuid?: string;
  message?: { role?: string; content?: unknown };
}

let watcher: FSWatcher | undefined;
let indexing = Promise.resolve();

export interface IndexProgress {
  scanned: number;
  total: number;
  done: boolean;
}

let progress: IndexProgress = { scanned: 0, total: 0, done: false };
const progressListeners = new Set<(p: IndexProgress) => void>();

export function onIndexProgress(cb: (p: IndexProgress) => void): () => void {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

function setProgress(p: IndexProgress): void {
  progress = p;
  for (const cb of progressListeners) cb(p);
}

export function getIndexProgress(): IndexProgress {
  return progress;
}

/** Extract the searchable text of a message content block. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: { type?: string; text?: string }) =>
      block?.type === "text" && typeof block.text === "string" ? block.text : "",
    )
    .filter(Boolean)
    .join("\n");
}

async function indexFile(filePath: string): Promise<void> {
  const db = openDb();
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat) return;

  const row = db.prepare("SELECT offset, mtime FROM indexed_files WHERE path = ?").get(filePath) as
    | { offset: number; mtime: number }
    | undefined;
  let offset = row?.offset ?? 0;
  if (offset >= stat.size) return; // nothing new

  const sessionId = path.basename(filePath, ".jsonl");
  const project = path.basename(path.dirname(filePath));

  const stream = fs.createReadStream(filePath, { start: offset, encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const insertMsg = db.prepare(
    "INSERT INTO conv_messages (session_id, role, ts, text) VALUES (?, ?, ?, ?)",
  );
  const upsertSession = db.prepare(
    `INSERT INTO conv_sessions (session_id, project, cwd, title, started_at, last_at)
     VALUES (@sid, @project, @cwd, @title, @ts, @ts)
     ON CONFLICT(session_id) DO UPDATE SET
       cwd = COALESCE(excluded.cwd, cwd),
       title = COALESCE(conv_sessions.title, excluded.title),
       started_at = MIN(COALESCE(conv_sessions.started_at, excluded.started_at), excluded.started_at),
       last_at = MAX(COALESCE(conv_sessions.last_at, 0), excluded.last_at)`,
  );
  const setTitle = db.prepare("UPDATE conv_sessions SET title = ? WHERE session_id = ?");

  const rows: { role: string; ts: number | null; text: string; cwd?: string }[] = [];
  let summaryTitle: string | undefined;

  for await (const line of rl) {
    offset += Buffer.byteLength(line, "utf8") + 1;
    if (line.length < 2 || line.length > 2_000_000) continue;
    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line) as TranscriptLine;
    } catch {
      continue;
    }
    if (parsed.type === "summary" && parsed.summary) {
      summaryTitle = parsed.summary;
      continue;
    }
    if (parsed.isSidechain) continue;
    if (parsed.type !== "user" && parsed.type !== "assistant") continue;
    const role = parsed.message?.role ?? parsed.type;
    const text = contentText(parsed.message?.content).trim();
    if (!text || text.startsWith("<local-command") || text.startsWith("<command-name>")) continue;
    rows.push({
      role,
      ts: parsed.timestamp ? Date.parse(parsed.timestamp) : null,
      text: text.slice(0, 50_000),
      cwd: parsed.cwd,
    });
  }

  db.transaction(() => {
    for (const r of rows) insertMsg.run(sessionId, r.role, r.ts, r.text);
    const first = rows.find((r) => r.role === "user");
    const ts = rows.find((r) => r.ts)?.ts ?? stat.mtimeMs;
    upsertSession.run({
      sid: sessionId,
      project,
      cwd: rows.find((r) => r.cwd)?.cwd ?? null,
      title: summaryTitle ?? first?.text.slice(0, 120) ?? null,
      ts,
    });
    if (summaryTitle) setTitle.run(summaryTitle, sessionId);
    db.prepare(
      `INSERT INTO indexed_files (path, offset, mtime) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET offset = excluded.offset, mtime = excluded.mtime`,
    ).run(filePath, offset, stat.mtimeMs);
  })();
}

function listTranscripts(): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const files: string[] = [];
  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    const full = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith(".jsonl")) files.push(path.join(full, f));
    }
  }
  return files;
}

/** Queue a file for indexing; serialized so sqlite writes never interleave. */
function enqueue(filePath: string): void {
  indexing = indexing.then(() => indexFile(filePath)).catch(() => {});
}

export function startIndexer(): void {
  const files = listTranscripts();
  setProgress({ scanned: 0, total: files.length, done: files.length === 0 });
  let scanned = 0;
  for (const f of files) {
    indexing = indexing
      .then(() => indexFile(f))
      .catch(() => {})
      .then(() => {
        scanned++;
        if (scanned % 25 === 0 || scanned === files.length) {
          setProgress({ scanned, total: files.length, done: scanned === files.length });
        }
      });
  }

  watcher = watch(PROJECTS_DIR, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
  });
  watcher.on("add", (f: string) => f.endsWith(".jsonl") && enqueue(f));
  watcher.on("change", (f: string) => f.endsWith(".jsonl") && enqueue(f));
}

export function stopIndexer(): void {
  void watcher?.close();
  watcher = undefined;
}

export interface SearchHit {
  session_id: string;
  project: string;
  cwd: string | null;
  title: string | null;
  last_at: number | null;
  snippet: string;
  role: string;
  ts: number | null;
}

export function searchConversations(query: string, limit = 40): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  // Quote each term so user input can't break FTS5 query syntax.
  const ftsQuery = q
    .split(/\s+/)
    .map((t) => `"${t.replaceAll('"', '""')}"*`)
    .join(" ");
  return openDb()
    .prepare(
      `SELECT m.session_id, s.project, s.cwd, s.title, s.last_at, m.role, m.ts,
              snippet(conv_fts, 0, '⟪', '⟫', '...', 18) AS snippet
       FROM conv_fts
       JOIN conv_messages m ON m.id = conv_fts.rowid
       JOIN conv_sessions s ON s.session_id = m.session_id
       WHERE conv_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as SearchHit[];
}

export interface ConvMessage {
  role: string;
  ts: number | null;
  text: string;
}

export function sessionMessages(sessionId: string): ConvMessage[] {
  return openDb()
    .prepare("SELECT role, ts, text FROM conv_messages WHERE session_id = ? ORDER BY id")
    .all(sessionId) as ConvMessage[];
}
