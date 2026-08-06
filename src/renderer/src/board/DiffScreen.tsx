import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Diff,
  getChangeKey,
  Hunk,
  isDelete,
  parseDiff,
  type ChangeData,
  type FileData,
} from "react-diff-view";
import "react-diff-view/style/index.css";
import type {
  DraftComment,
  IssuePr,
  MergeMethod,
  PrComment,
  PrDetail,
  ReviewEvent,
} from "../../../main/github.js";

const checkColor = (state: string) =>
  /success|pass/i.test(state) ? "text-green" : /fail|error/i.test(state) ? "text-red" : "text-dim";

const mergeLabel: Record<MergeMethod, string> = {
  merge: "merge",
  squash: "squash & merge",
  rebase: "rebase & merge",
};

const isTyping = (e: KeyboardEvent) =>
  ["TEXTAREA", "INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "");

function CommentCard({ comment }: { comment: PrComment }) {
  const settled = comment.resolved || comment.outdated;
  return (
    <div
      className={`mx-2 my-1.5 rounded-r-md border-l-2 bg-card px-3 py-2 ${
        settled ? "border-edge2 opacity-50" : "border-orange"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-bold text-soft">{comment.author}</span>
        {comment.isBot && <span className="rounded bg-card2 px-1 text-dim">bot</span>}
        {comment.resolved && <span className="text-green">resolved</span>}
        {comment.outdated && !comment.resolved && <span className="text-dim">outdated</span>}
        <button
          onClick={() => window.open(comment.url)}
          className="ml-auto text-dim hover:text-ink"
        >
          ↗
        </button>
      </div>
      <div className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-body">
        {comment.body}
      </div>
    </div>
  );
}

interface Draft extends DraftComment {
  id: number;
}

function DraftCard({ draft, onDelete }: { draft: Draft; onDelete: () => void }) {
  return (
    <div className="mx-2 my-1.5 rounded-r-md border-l-2 border-accent bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="rounded bg-accent/15 px-1 text-accent">draft</span>
        {draft.startLine && draft.startLine < draft.line && (
          <span className="text-dim">
            L{draft.startLine}–{draft.line}
          </span>
        )}
        <button onClick={onDelete} className="ml-auto text-dim hover:text-red">
          ×
        </button>
      </div>
      <div className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-body">
        {draft.body}
      </div>
    </div>
  );
}

interface ComposerTarget {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
}

function Composer({
  target,
  onSave,
  onCancel,
}: {
  target: ComposerTarget;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => {
    const body = ref.current?.value.trim();
    if (body) onSave(body);
  };
  return (
    <div className="mx-2 my-1.5 rounded-md border border-accent/40 bg-card px-3 py-2">
      <div className="pb-1 text-[10px] text-dim">
        {target.startLine && target.startLine < target.line
          ? `comment on lines ${target.startLine}–${target.line}`
          : `comment on line ${target.line}`}
        <span className="ml-2 text-dim/70">shift-click another + to make it a range</span>
      </div>
      <textarea
        ref={ref}
        rows={3}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        className="w-full resize-y rounded border border-edge2 bg-bg px-2 py-1.5 font-sans text-[11px] text-body outline-none focus:border-accent"
        placeholder="Leave a comment…"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          onClick={save}
          className="rounded-md border border-accent/40 px-2.5 py-1 text-[11px] text-accent hover:border-accent"
        >
          add draft ⌘↵
        </button>
        <button onClick={onCancel} className="px-2 py-1 text-[11px] text-dim hover:text-ink">
          cancel
        </button>
      </div>
    </div>
  );
}

export function DiffScreen({ pr, onClose }: { pr: IssuePr; onClose: () => void }) {
  const [diffText, setDiffText] = useState<string>();
  const [detail, setDetail] = useState<PrDetail | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<"review" | "merge">();
  const [actionError, setActionError] = useState<string>();
  const [comments, setComments] = useState<PrComment[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>();
  const draftSeq = useRef(0);
  const rejectRef = useRef<HTMLTextAreaElement>(null);

  const refresh = () => {
    void window.deck.gh.prDetail(pr.repo, pr.number).then(setDetail);
    void window.deck.gh.prComments(pr.repo, pr.number).then(setComments);
  };

  useEffect(() => {
    void window.deck.gh.prDiff(pr.repo, pr.number).then(setDiffText);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr.repo, pr.number]);

  const methods = detail?.mergeMethods ?? ["merge"];
  const chosenMethod = mergeMethod && methods.includes(mergeMethod) ? mergeMethod : methods[0];

  const submitReview = async (event: ReviewEvent, body = "") => {
    setBusy("review");
    setActionError(undefined);
    const result = await window.deck.gh.review(
      pr.repo,
      pr.number,
      event,
      body,
      drafts.map(({ id: _id, ...comment }) => comment),
    );
    setBusy(undefined);
    if (!result.ok) return setActionError(result.error);
    setDrafts([]);
    setComposer(null);
    setRejectOpen(false);
    refresh();
  };

  const merge = async () => {
    setBusy("merge");
    setActionError(undefined);
    const result = await window.deck.gh.merge(pr.repo, pr.number, chosenMethod);
    setBusy(undefined);
    if (!result.ok) return setActionError(result.error);
    refresh();
  };

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
      if (isTyping(e)) return;
      if (e.key === "Escape") {
        if (composer) setComposer(null);
        else if (rejectOpen) setRejectOpen(false);
        else onClose();
      } else if (e.key === "j") setSelected((s) => Math.min(s + 1, files.length - 1));
      else if (e.key === "k") setSelected((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, onClose, composer, rejectOpen]);

  const file = files[selected];
  const filePath = file ? file.newPath || file.oldPath : "";

  const generalComments = useMemo(() => comments.filter((c) => !c.path), [comments]);
  const commentsByPath = useMemo(() => {
    const map = new Map<string, PrComment[]>();
    for (const comment of comments) {
      if (!comment.path) continue;
      map.set(comment.path, [...(map.get(comment.path) ?? []), comment]);
    }
    return map;
  }, [comments]);

  const openComposer = (target: ComposerTarget, extend: boolean) => {
    setComposer((prev) => {
      if (extend && prev && prev.path === target.path && prev.side === target.side) {
        const lines = [prev.startLine ?? prev.line, prev.line, target.line];
        return { ...prev, startLine: Math.min(...lines), line: Math.max(...lines) };
      }
      return target;
    });
  };

  // Anchor everything to its diff line, Linear-style: existing threads, local
  // drafts, and the open composer. Threads whose line no longer exists in the
  // diff (outdated code) fall back to a block on top of the file.
  const { widgets, unanchored } = useMemo(() => {
    const widgets: Record<string, ReactNode> = {};
    const unanchored: PrComment[] = [];
    if (!file) return { widgets, unanchored };

    const newSide = new Map<number, string>();
    const oldSide = new Map<number, string>();
    for (const hunk of file.hunks)
      for (const change of hunk.changes) {
        const key = getChangeKey(change);
        if (change.type === "insert") newSide.set(change.lineNumber, key);
        else if (change.type === "delete") oldSide.set(change.lineNumber, key);
        else if (change.type === "normal") {
          newSide.set(change.newLineNumber, key);
          oldSide.set(change.oldLineNumber, key);
        }
      }

    const parts = new Map<string, ReactNode[]>();
    const push = (key: string, node: ReactNode) =>
      parts.set(key, [...(parts.get(key) ?? []), node]);

    for (const comment of commentsByPath.get(filePath) ?? []) {
      const key = comment.line == null ? undefined : newSide.get(comment.line);
      if (key) push(key, <CommentCard key={`c${comment.id}`} comment={comment} />);
      else unanchored.push(comment);
    }
    for (const draft of drafts.filter((d) => d.path === filePath)) {
      const key = (draft.side === "LEFT" ? oldSide : newSide).get(draft.line);
      if (key)
        push(
          key,
          <DraftCard
            key={`d${draft.id}`}
            draft={draft}
            onDelete={() => setDrafts((ds) => ds.filter((d) => d.id !== draft.id))}
          />,
        );
    }
    if (composer && composer.path === filePath) {
      const key = (composer.side === "LEFT" ? oldSide : newSide).get(composer.line);
      if (key)
        push(
          key,
          <Composer
            key="composer"
            target={composer}
            onCancel={() => setComposer(null)}
            onSave={(body) => {
              setDrafts((ds) => [...ds, { ...composer, id: draftSeq.current++, body }]);
              setComposer(null);
            }}
          />,
        );
    }
    for (const [key, nodes] of parts) widgets[key] = <div className="max-w-[720px] py-1">{nodes}</div>;
    return { widgets, unanchored };
  }, [file, filePath, commentsByPath, drafts, composer]);

  const renderGutter = ({
    change,
    side,
    inHoverState,
    renderDefault,
    wrapInAnchor,
  }: {
    change: ChangeData;
    side: "old" | "new";
    inHoverState: boolean;
    renderDefault: () => ReactNode;
    wrapInAnchor: (element: ReactNode) => ReactNode;
  }) => {
    const gutter = wrapInAnchor(renderDefault());
    if (!inHoverState || detail?.state === "MERGED") return gutter;
    // A removed line only exists on the left, so that is the side to comment on.
    const commentSide = isDelete(change) || side === "old" ? "LEFT" : "RIGHT";
    const line =
      change.type === "normal"
        ? commentSide === "LEFT"
          ? change.oldLineNumber
          : change.newLineNumber
        : change.lineNumber;
    return (
      <>
        {gutter}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openComposer({ path: filePath, line, side: commentSide }, e.shiftKey);
          }}
          title="Comment on this line — shift-click to cover a range"
          className="absolute ml-0.5 rounded bg-accent px-1 text-[10px] font-bold text-bg"
        >
          +
        </button>
      </>
    );
  };

  const approved = detail?.reviewDecision === "APPROVED";
  const merged = detail?.state === "MERGED";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg pt-[38px]">
      <div className="relative flex items-center gap-3 border-b border-edge px-5 py-2.5">
        <span className="text-xs font-bold text-ink">
          #{pr.number} {pr.title}
        </span>
        <span className="text-[11px] text-dim">{pr.repo}</span>
        {detail?.reviewDecision && (
          <span className="text-[11px] text-orange">{detail.reviewDecision.toLowerCase()}</span>
        )}
        {actionError && <span className="text-[11px] text-red">{actionError}</span>}
        <span className="ml-auto flex gap-2 text-[10px]">
          {detail?.checks.slice(0, 6).map((c, i) => (
            <span key={i} className={checkColor(c.state)} title={c.name}>
              ●
            </span>
          ))}
        </span>
        {merged ? (
          <span className="text-[11px] text-accent">merged</span>
        ) : (
          <>
            {drafts.length > 0 && (
              <button
                onClick={() => void submitReview("COMMENT")}
                disabled={busy !== undefined}
                className="rounded-md border border-edge2 px-2.5 py-1 text-[11px] text-body hover:border-edge3 disabled:opacity-40"
              >
                send {drafts.length} comment{drafts.length > 1 ? "s" : ""}
              </button>
            )}
            <button
              onClick={() => void submitReview("APPROVE")}
              disabled={busy !== undefined || approved}
              className="rounded-md border border-edge2 px-2.5 py-1 text-[11px] text-green hover:border-green disabled:opacity-40"
            >
              {busy === "review"
                ? "sending…"
                : approved
                  ? "✓ approved"
                  : `✓ approve${drafts.length > 0 ? ` +${drafts.length}` : ""}`}
            </button>
            <button
              onClick={() => setRejectOpen((o) => !o)}
              disabled={busy !== undefined}
              className="rounded-md border border-edge2 px-2.5 py-1 text-[11px] text-red hover:border-red disabled:opacity-40"
            >
              ✗ reject
            </button>
            {methods.length > 1 && (
              <select
                value={chosenMethod}
                onChange={(e) => setMergeMethod(e.target.value as MergeMethod)}
                className="rounded-md border border-edge2 bg-card px-1.5 py-1 text-[11px] text-body outline-none"
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {mergeLabel[m]}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void merge()}
              disabled={busy !== undefined}
              className="rounded-md border border-edge2 px-2.5 py-1 text-[11px] text-accent hover:border-accent disabled:opacity-40"
            >
              {busy === "merge" ? "merging…" : `⇥ ${methods.length > 1 ? "merge" : mergeLabel[chosenMethod]}`}
            </button>
          </>
        )}
        <button onClick={onClose} className="text-[11px] text-dim hover:text-ink">
          esc ×
        </button>
        {rejectOpen && (
          <div className="absolute right-5 top-full z-50 mt-1 w-[360px] rounded-md border border-edge2 bg-panel p-3 shadow-lg">
            <div className="pb-1.5 text-[10px] text-dim">Say what needs to change.</div>
            <textarea
              ref={rejectRef}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setRejectOpen(false);
              }}
              className="w-full resize-y rounded border border-edge2 bg-bg px-2 py-1.5 font-sans text-[11px] text-body outline-none focus:border-red"
            />
            <button
              onClick={() => {
                const body = rejectRef.current?.value.trim();
                if (body) void submitReview("REQUEST_CHANGES", body);
              }}
              disabled={busy !== undefined}
              className="mt-1.5 rounded-md border border-red/40 px-2.5 py-1 text-[11px] text-red hover:bg-red/10 disabled:opacity-40"
            >
              request changes{drafts.length > 0 ? ` +${drafts.length} drafts` : ""}
            </button>
          </div>
        )}
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
              {(() => {
                const path = f.newPath || f.oldPath;
                const list = commentsByPath.get(path) ?? [];
                const open = list.filter((c) => !c.resolved && !c.outdated).length;
                const drafted = drafts.filter((d) => d.path === path).length;
                return (
                  <>
                    {list.length > 0 && (
                      <span className={`ml-2 ${open > 0 ? "text-orange" : "text-dim"}`}>
                        ⬩{open > 0 ? open : list.length}
                      </span>
                    )}
                    {drafted > 0 && <span className="ml-1 text-accent">✎{drafted}</span>}
                  </>
                );
              })()}
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
          {generalComments.length > 0 && (
            <div className="border-b border-edge px-2 py-2">
              <div className="px-2 pb-1 text-[10px] tracking-widest text-dim">REVIEW COMMENTS</div>
              <div className="max-w-[720px]">
                {generalComments.map((c) => (
                  <CommentCard key={c.id} comment={c} />
                ))}
              </div>
            </div>
          )}
          {file && (
            <>
              <div className="border-b border-edge px-4 py-2 font-mono text-[11px] text-mut">
                {filePath}
              </div>
              {unanchored.length > 0 && (
                <div className="max-w-[720px] border-b border-edge py-1">
                  {unanchored.map((c) => (
                    <CommentCard key={c.id} comment={c} />
                  ))}
                </div>
              )}
              <Diff
                viewType="split"
                diffType={file.type}
                hunks={file.hunks}
                widgets={widgets}
                renderGutter={renderGutter}
              >
                {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
              </Diff>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
