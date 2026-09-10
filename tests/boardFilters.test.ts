import { describe, expect, it } from "vitest";
import type { BoardIssue } from "../src/main/board/types.js";
import { filterBoardIssues, noBoardFilters } from "../src/renderer/src/board/BoardFilters.js";

const issue = (over: Partial<BoardIssue> & Pick<BoardIssue, "key">): BoardIssue => ({
  id: over.key,
  summary: "",
  statusId: "1",
  statusName: "To Do",
  assignee: null,
  assigneeId: null,
  updated: "2026-09-10T10:00:00Z",
  url: `https://example.test/${over.key}`,
  ...over,
});

const board: BoardIssue[] = [
  issue({ key: "web#1", summary: "Fix the standings table", type: "Task", assignee: "Sander", assigneeId: "me" }),
  issue({ key: "web#2", summary: "Group stage seeding", type: "Feature", assignee: "Robin", assigneeId: "other" }),
  issue({ key: "api#3", summary: "Rate limit the sync", type: "Task", assignee: null, assigneeId: null }),
];

const keys = (issues: BoardIssue[]) => issues.map((i) => i.key);

describe("filterBoardIssues", () => {
  it("keeps every card when nothing is filtered", () => {
    expect(keys(filterBoardIssues(board, noBoardFilters, "me"))).toEqual(["web#1", "web#2", "api#3"]);
  });

  it("matches text against the key, the summary and the assignee", () => {
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, text: "api#" }, "me"))).toEqual(["api#3"]);
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, text: "seeding" }, "me"))).toEqual(["web#2"]);
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, text: "robin" }, "me"))).toEqual(["web#2"]);
  });

  it("narrows to one facet value", () => {
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, facets: { type: "Task" } }, "me")))
      .toEqual(["web#1", "api#3"]);
  });

  it("combines a facet with the text", () => {
    const filters = { ...noBoardFilters, text: "sync", facets: { type: "Task" } };
    expect(keys(filterBoardIssues(board, filters, "me"))).toEqual(["api#3"]);
  });

  it("keeps only my cards when mineOnly is on", () => {
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, mineOnly: true }, "me"))).toEqual(["web#1"]);
  });

  // A cache synced before deck recorded the account id cannot tell whose card
  // is whose, so the filter has to stay out of the way rather than empty the board.
  it("ignores mineOnly when the account id is unknown", () => {
    expect(keys(filterBoardIssues(board, { ...noBoardFilters, mineOnly: true }, undefined))).toHaveLength(3);
  });

  it("drops cards from a tracker that has no type when that facet is chosen", () => {
    const untyped = [issue({ key: "LIN-1", summary: "No types here" })];
    expect(filterBoardIssues(untyped, { ...noBoardFilters, facets: { type: "Task" } }, "me")).toEqual([]);
  });
});
