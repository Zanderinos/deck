import type { AgentLaunch } from "../../../shared/agents.js";
// Minimal cross-view event bus: lets search (or later, the board) open a
// terminal tab without threading callbacks through the whole tree.

export interface OpenTabDetail extends AgentLaunch {
  cwd?: string;
  command?: string;
  issueKey?: string;
  sessionId?: string;
}

// Mouse/keyboard "back": overlays get first refusal (they call
// preventDefault when they consume it), then the view history moves.
const NAV_BACK = "deck:nav-back";

export function requestNavBack(): boolean {
  return !window.dispatchEvent(new CustomEvent(NAV_BACK, { cancelable: true }));
}

export function onNavBack(cb: (e: Event) => void): () => void {
  window.addEventListener(NAV_BACK, cb);
  return () => window.removeEventListener(NAV_BACK, cb);
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
