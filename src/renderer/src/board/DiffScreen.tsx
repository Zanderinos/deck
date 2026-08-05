import { useEffect, useMemo, useState } from "react";
import { Diff, Hunk, parseDiff, type FileData } from "react-diff-view";
import "react-diff-view/style/index.css";
import type { IssuePr } from "../../../main/github.js";
import type { PrDetail } from "../../../main/github.js";

const checkColor = (state: string) =>
  /success|pass/i.test(state) ? "text-green" : /fail|error/i.test(state) ? "text-red" : "text-dim";

export function DiffScreen({ pr, onClose }: { pr: IssuePr; onClose: () => void }) {
  const [diffText, setDiffText] = useState<string>();
  const [detail, setDetail] = useState<PrDetail | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    void window.deck.gh.prDiff(pr.repo, pr.number).then(setDiffText);
    void window.deck.gh.prDetail(pr.repo, pr.number).then(setDetail);
  }, [pr.repo, pr.number]);

  const files = useMemo<FileData[]>(() => {
    if (!diffText || diffText.startsWith("diff unavailable")) return [];
    try {
      return parseDiff(diffText);
    } catch {
      return [];
    }
  }, [diffText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "j") setSelected((s) => Math.min(s + 1, files.length - 1));
      else if (e.key === "k") setSelected((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, onClose]);

  const file = files[selected];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg pt-[38px]">
      <div className="flex items-center gap-3 border-b border-edge px-5 py-2.5">
        <span className="text-xs font-bold text-ink">
          #{pr.number} {pr.title}
        </span>
        <span className="text-[11px] text-dim">{pr.repo}</span>
        {detail?.reviewDecision && (
          <span className="text-[11px] text-orange">{detail.reviewDecision.toLowerCase()}</span>
        )}
        <span className="ml-auto flex gap-2 text-[10px]">
          {detail?.checks.slice(0, 6).map((c, i) => (
            <span key={i} className={checkColor(c.state)} title={c.name}>
              ●
            </span>
          ))}
        </span>
        <button onClick={onClose} className="text-[11px] text-dim hover:text-ink">
          esc ×
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[280px] shrink-0 overflow-y-auto border-r border-edge p-2">
          {files.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-[11px] ${
                i === selected ? "bg-card2 text-ink" : "text-mut hover:text-ink"
              }`}
              title={f.newPath || f.oldPath}
            >
              {(f.newPath || f.oldPath).split("/").pop()}
              <span className="ml-2 text-green">
                +
                {f.hunks.reduce(
                  (n, h) => n + h.changes.filter((c) => c.type === "insert").length,
                  0,
                )}
              </span>
              <span className="ml-1 text-red">
                −
                {f.hunks.reduce(
                  (n, h) => n + h.changes.filter((c) => c.type === "delete").length,
                  0,
                )}
              </span>
            </button>
          ))}
          {diffText === undefined && <div className="px-2 pt-2 text-[11px] text-dim">loading…</div>}
          {diffText?.startsWith("diff unavailable") && (
            <div className="px-2 pt-2 text-[11px] text-red">{diffText}</div>
          )}
        </div>
        <div className="deck-diff min-w-0 flex-1 select-text overflow-auto">
          {file && (
            <>
              <div className="border-b border-edge px-4 py-2 font-mono text-[11px] text-mut">
                {file.newPath || file.oldPath}
              </div>
              <Diff viewType="split" diffType={file.type} hunks={file.hunks}>
                {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
              </Diff>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
