import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../board/icons.js";
import { useTabs } from "../store.js";

// Closing a tab that sits in a linked worktree is the one moment deck knows a
// worktree has become unwanted. The tab waits until this is answered, and
// nothing is removed unless the user picks it: the uncommitted file count is
// shown so a removal is never blind, and keeping is the default when there is
// any.

export function WorktreeClosePrompt() {
  const { worktreeClose, closeTab, dismissWorktreeClose } = useTabs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const dirty = worktreeClose?.worktree.dirtyFiles ?? 0;

  const closeAndDismiss = useCallback(() => {
    if (!worktreeClose) return;
    dismissWorktreeClose();
    closeTab(worktreeClose.termId);
  }, [worktreeClose, dismissWorktreeClose, closeTab]);

  useEffect(() => {
    if (!worktreeClose) { setError(""); setBusy(false); return; }
    (dirty ? keepRef : removeRef).current?.focus();
  }, [worktreeClose, dirty]);

  useEffect(() => {
    if (!worktreeClose || busy) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape keeps the worktree: an accidental key never deletes work.
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAndDismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [worktreeClose, busy, closeAndDismiss]);

  if (!worktreeClose) return null;
  const { worktree } = worktreeClose;

  const remove = async (deleteBranch: boolean) => {
    setBusy(true);
    setError("");
    // The shell still holds this directory as its cwd, so it is killed before
    // the directory goes. Closing was asked for either way: a removal that
    // fails leaves the error on screen with the tab already gone.
    closeTab(worktreeClose.termId);
    const result = await window.deck.worktrees.remove(worktree.path, deleteBranch);
    setBusy(false);
    if (!result.removed) { setError(result.error || "Could not remove the worktree"); return; }
    // A branch that refuses to delete still leaves the worktree gone, so the
    // leftover branch shows up in the sweep rather than blocking here.
    dismissWorktreeClose();
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 font-sans">
    <div role="dialog" aria-modal="true" aria-label="Close tab and its worktree"
      className="w-[min(460px,90vw)] rounded-xl border border-edge3 bg-overlay p-4 shadow-2xl">
      <div className="flex items-center gap-2 text-[13px] text-ink">
        <Icon name="branch" size={13} className="shrink-0 text-mut" />
        <span className="min-w-0 truncate">Close this tab and its worktree?</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mut">
        This tab is in a worktree of {worktree.repo}. Worktrees keep their own dependencies,
        so leaving it behind keeps its disk space too.
      </p>
      <dl className="mt-3 space-y-1 rounded-lg border border-edge2 bg-card/50 p-2.5 text-[11px]">
        <div className="flex gap-2"><dt className="w-16 shrink-0 text-dim">Branch</dt>
          <dd className="min-w-0 truncate text-body">{worktree.branch || "detached HEAD"}</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 text-dim">Path</dt>
          <dd className="min-w-0 truncate text-body" title={worktree.path}>{worktree.path}</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 text-dim">Changes</dt>
          <dd className={dirty ? "text-orange" : "text-body"}>
            {dirty ? `${dirty} uncommitted file${dirty === 1 ? "" : "s"}` : "none, tree is clean"}
          </dd></div>
      </dl>
      {error && <p className="mt-2 text-[11px] text-red">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button ref={keepRef} disabled={busy} onClick={closeAndDismiss}
          className="rounded-md border border-edge3 px-2.5 py-1.5 text-[11px] text-soft outline-none hover:bg-card focus-visible:border-mut disabled:opacity-40">
          Keep worktree
        </button>
        <button ref={removeRef} disabled={busy} onClick={() => void remove(false)}
          className="rounded-md border border-edge3 px-2.5 py-1.5 text-[11px] text-soft outline-none hover:bg-card focus-visible:border-mut disabled:opacity-40">
          Remove worktree
        </button>
        <button disabled={busy || !worktree.branch} onClick={() => void remove(true)}
          title={worktree.branch ? `Also delete ${worktree.branch}` : "Detached HEAD has no branch to delete"}
          className="rounded-md border border-red/40 px-2.5 py-1.5 text-[11px] text-red outline-none hover:bg-red/10 focus-visible:border-red disabled:opacity-40">
          Remove and delete branch
        </button>
      </div>
    </div>
  </div>;
}
