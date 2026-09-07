import type { Agent } from "../shared/agents.js";

export interface TranscriptMetadata {
  agent: Agent;
  sessionId: string;
  project: string;
  cwd?: string;
  historyMode?: string;
  skip?: boolean;
}

export interface TranscriptMessage {
  role: string;
  text: string;
  ts: number | null;
  key?: string;
}

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (!block || typeof block !== "object") return "";
    return ["text", "Text", "input_text", "output_text"].includes(block.type) && typeof block.text === "string"
      ? block.text : "";
  }).filter(Boolean).join("\n");
}

/** Rollouts contain tool traffic and injected instructions as well as chat. */
export function parseTranscriptLine(line: string, meta: TranscriptMetadata): { message?: TranscriptMessage; title?: string } {
  const row = JSON.parse(line);
  if (!row || typeof row !== "object") return {};
  const ts = Date.parse(row.timestamp);
  let role: string | undefined;
  let text = "";
  let key: string | undefined;
  if (meta.agent === "claude") {
    if (row.type === "summary" && typeof row.summary === "string") return { title: row.summary };
    if (row.isSidechain || !["user", "assistant"].includes(row.type)) return {};
    role = row.message?.role ?? row.type;
    text = contentText(row.message?.content);
    key = row.uuid;
    if (row.cwd) meta.cwd = row.cwd;
  } else {
    const payload = row.payload;
    if (!payload || typeof payload !== "object") return {};
    if (row.type === "session_meta") {
      meta.sessionId = payload.id ?? payload.session_id ?? meta.sessionId;
      meta.cwd = payload.cwd;
      meta.historyMode = payload.history_mode;
      meta.skip = typeof payload.source === "object" || String(payload.source).startsWith("subagent");
      return {};
    }
    if (meta.skip) return {};
    // Paginated rollouts persist user chat as completed items. Legacy files
    // repeat those messages in response_item; pick one source per format.
    if (meta.historyMode === "paginated" && row.type === "event_msg" && payload.type === "item_completed") {
      const item = payload.item;
      if (!item || !["UserMessage", "AgentMessage", "userMessage", "agentMessage"].includes(item.type)) return {};
      role = /user/i.test(item.type) ? "user" : "assistant";
      text = contentText(item.content ?? item.text);
      key = item.id;
    } else if (meta.historyMode !== "paginated" && row.type === "response_item" && payload.type === "message") {
      role = payload.role;
      text = contentText(payload.content);
      key = payload.id;
    } else return {};
  }
  text = text.trim();
  if (!text || !["user", "assistant"].includes(role ?? "")) return {};
  if (/^<(?:local-command|command-name|environment_context|permissions instructions|turn_aborted)/.test(text) || text.startsWith("# AGENTS.md instructions")) return {};
  return { message: { role: role!, text: text.slice(0, 50_000), ts: Number.isFinite(ts) ? ts : null, key } };
}
