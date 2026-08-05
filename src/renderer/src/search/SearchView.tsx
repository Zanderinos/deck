import { useEffect, useMemo, useRef, useState } from "react";
import type { ConvMessage, IndexProgress, SearchHit } from "../../../main/indexer.js";
import { openTerminalTab } from "../lib/bus.js";

function ago(ts: number | null): string {
  if (!ts) return "";
  const d = Date.now() - ts;
  const days = Math.floor(d / 86_400_000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(d / 3_600_000);
  if (hours > 0) return `${hours}h ago`;
  return `${Math.max(1, Math.floor(d / 60_000))}m ago`;
}

/** Render a snippet, highlighting the ⟪match⟫ markers emitted by FTS5. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/⟪|⟫/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-accent/30 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit>();
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [progress, setProgress] = useState<IndexProgress>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void window.deck.search.progress().then(setProgress);
    return window.deck.search.onProgress(setProgress);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) {
        setHits([]);
        return;
      }
      void window.deck.search.query(query).then(setHits);
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  // One row per session, keeping its best-ranked hit.
  const grouped = useMemo(() => {
    const seen = new Map<string, SearchHit>();
    for (const h of hits) if (!seen.has(h.session_id)) seen.set(h.session_id, h);
    return [...seen.values()];
  }, [hits]);

  useEffect(() => {
    if (!selected) return;
    void window.deck.search.session(selected.session_id).then(setMessages);
  }, [selected]);

  const resume = (hit: SearchHit) =>
    openTerminalTab({
      cwd: hit.cwd ?? undefined,
      command: `claude --resume ${hit.session_id}`,
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-edge px-4 drag-region">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your Claude conversations…"
          className="w-full max-w-2xl bg-transparent font-mono text-sm outline-none placeholder:text-dim/60"
        />
        {progress && !progress.done && (
          <span className="ml-auto shrink-0 text-[10px] text-dim">
            indexing {progress.scanned}/{progress.total}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[420px] shrink-0 overflow-y-auto border-r border-edge p-1.5">
          {grouped.length === 0 && query.trim() !== "" && (
            <div className="px-2 pt-3 text-xs text-dim">No matches in local conversations.</div>
          )}
          {grouped.map((hit) => (
            <button
              key={hit.session_id}
              onClick={() => setSelected(hit)}
              className={`block w-full rounded-md px-2.5 py-2 text-left hover:bg-edge/60 ${
                selected?.session_id === hit.session_id ? "bg-edge" : ""
              }`}
            >
              <div className="truncate text-xs font-medium text-ink">
                {hit.title ?? hit.session_id}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-dim">
                <Snippet text={hit.snippet} />
              </div>
              <div className="mt-0.5 text-[10px] text-dim/60">
                {hit.project.replace(/^-Users-[^-]+-/, "")} · {ago(hit.last_at)}
              </div>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge px-4">
                <span className="truncate text-xs text-dim">{selected.title}</span>
                <button
                  onClick={() => resume(selected)}
                  className="ml-auto shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] text-ink hover:border-accent hover:text-accent"
                >
                  Resume in terminal →
                </button>
              </div>
              <div className="min-h-0 flex-1 select-text overflow-y-auto px-4 py-3">
                {messages.map((m, i) => (
                  <div key={i} className="mb-3">
                    <div className="mb-0.5 text-[10px] uppercase tracking-wide text-dim/60">
                      {m.role}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-xs leading-5 text-ink/90">
                      {m.text.length > 4000 ? `${m.text.slice(0, 4000)}…` : m.text}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-dim/60">
              Select a result to read the conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
