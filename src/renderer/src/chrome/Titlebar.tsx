export function Titlebar({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="flex h-[38px] shrink-0 items-center gap-4 border-b border-edge pl-[84px] pr-3.5 drag-region">
      <div className="font-bold tracking-widest text-ink">deck</div>
      <div className="flex flex-1 justify-center">
        <button
          onClick={onSearch}
          className="flex w-[340px] items-center gap-2.5 rounded-md border border-edge2 bg-overlay px-3 py-1 text-xs text-dim hover:border-edge3 hover:text-body"
        >
          <span>⌕</span>
          <span className="flex-1 text-left">Search sessions, agents, files…</span>
          <span className="rounded border border-edge2 px-1.5 text-[10px]">⌘K</span>
        </button>
      </div>
      <div className="text-[11px] text-dim">⌘1/2/3 views</div>
    </div>
  );
}
