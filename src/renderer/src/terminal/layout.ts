export type PaneLayout = { termId: string } | { direction: "row" | "column"; ratio: number; first: PaneLayout; second: PaneLayout };
export interface PaneRect { termId: string; left: number; top: number; width: number; height: number }

export function paneIds(layout: PaneLayout): string[] {
  return "termId" in layout ? [layout.termId] : [...paneIds(layout.first), ...paneIds(layout.second)];
}
export function splitPane(layout: PaneLayout, target: string, next: string, direction: "row" | "column"): PaneLayout {
  if ("termId" in layout) return layout.termId === target ? { direction, ratio: 0.5, first: layout, second: { termId: next } } : layout;
  return { ...layout, first: splitPane(layout.first, target, next, direction), second: splitPane(layout.second, target, next, direction) };
}
export function pruneLayout(layout: PaneLayout, live: Set<string>): PaneLayout | undefined {
  if ("termId" in layout) return live.has(layout.termId) ? layout : undefined;
  const first = pruneLayout(layout.first, live);
  const second = pruneLayout(layout.second, live);
  return first && second ? { ...layout, first, second } : first ?? second;
}

/** Stable leaf containers keep xterm mounted while layouts change. */
export function paneRects(layout: PaneLayout, area = { left: 0, top: 0, width: 100, height: 100 }): PaneRect[] {
  if ("termId" in layout) return [{ termId: layout.termId, ...area }];
  const ratio = Math.min(0.9, Math.max(0.1, layout.ratio));
  const first = layout.direction === "row" ? { ...area, width: area.width * ratio } : { ...area, height: area.height * ratio };
  const second = layout.direction === "row"
    ? { ...area, left: area.left + first.width, width: area.width - first.width }
    : { ...area, top: area.top + first.height, height: area.height - first.height };
  return [...paneRects(layout.first, first), ...paneRects(layout.second, second)];
}

export interface PaneDivider {
  path: ("first" | "second")[];
  direction: "row" | "column";
  ratio: number;
  area: Omit<PaneRect, "termId">;
}
export function paneDividers(layout: PaneLayout, area = { left: 0, top: 0, width: 100, height: 100 }, path: PaneDivider["path"] = []): PaneDivider[] {
  if ("termId" in layout) return [];
  const first = layout.direction === "row" ? { ...area, width: area.width * layout.ratio } : { ...area, height: area.height * layout.ratio };
  const second = layout.direction === "row" ? { ...area, left: area.left + first.width, width: area.width - first.width } : { ...area, top: area.top + first.height, height: area.height - first.height };
  return [{ path, direction: layout.direction, ratio: layout.ratio, area }, ...paneDividers(layout.first, first, [...path, "first"]), ...paneDividers(layout.second, second, [...path, "second"])];
}
export function resizePane(layout: PaneLayout, path: PaneDivider["path"], ratio: number): PaneLayout {
  if ("termId" in layout) return layout;
  if (!path.length) return { ...layout, ratio: Math.min(0.85, Math.max(0.15, ratio)) };
  const [child, ...remaining] = path;
  return { ...layout, [child]: resizePane(layout[child], remaining, ratio) };
}
