// Minimal cross-view event bus: lets search (or later, the board) open a
// terminal tab without threading callbacks through the whole tree.

export interface OpenTabDetail {
  cwd?: string;
  command?: string;
}

const OPEN_TAB = "deck:open-tab";

export function openTerminalTab(detail: OpenTabDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_TAB, { detail }));
}

export function onOpenTerminalTab(cb: (detail: OpenTabDetail) => void): () => void {
  const listener = (e: Event) => cb((e as CustomEvent<OpenTabDetail>).detail);
  window.addEventListener(OPEN_TAB, listener);
  return () => window.removeEventListener(OPEN_TAB, listener);
}
