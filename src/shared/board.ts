import type { BoardProviderKind } from "./settings.js";

/** Product names of the trackers the board can mirror, for labels on both sides. */
export const boardProviderLabels: Record<BoardProviderKind, string> = {
  jira: "Jira",
  linear: "Linear",
  github: "GitHub Projects",
};
