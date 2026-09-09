import type { BoardProviderKind } from "../../shared/settings.js";

// The board as deck shows it, whatever tracker it mirrors. Adapters translate
// their vendor's shapes into these; nothing outside the adapters sees a
// vendor field.

export interface BoardColumn {
  name: string;
  /** Tracker status ids that land in this column; one column can hold several. */
  statusIds: string[];
}

export interface BoardIssue {
  /** Tracker-internal id, for endpoints that do not take the key. */
  id: string;
  /** Human identifier: APP-12 in Jira and Linear, repo#12 in GitHub. */
  key: string;
  summary: string;
  statusId: string;
  statusName: string;
  assignee: string | null;
  /** Tracker account id of the assignee — how "mine" is decided. */
  assigneeId: string | null;
  updated: string;
  /** Link to the issue in the tracker's own UI. */
  url: string;
  /** Set when the card sits in a column deck moved it to locally, not the tracker. */
  localMove?: true;
}

export interface BoardCache {
  provider: BoardProviderKind;
  boardName: string;
  columns: BoardColumn[];
  issues: BoardIssue[];
  /** Account id of the authenticated user, absent on caches from older syncs. */
  myAccountId?: string;
  at: number;
}

export interface BoardColumnStatuses {
  name: string;
  statuses: { id: string; name: string }[];
}

export interface LinkedPullRequest {
  /** Full "owner/repo" as GitHub names it. */
  repo: string;
  number: number;
  title: string;
  /** OPEN, MERGED, DECLINED or DRAFT. */
  status: string;
  url: string;
  lastUpdate: string;
}

export interface IssueHit {
  key: string;
  summary: string;
  status: string;
  type: string;
  assignee: string | null;
  priority: string | null;
  parent: string | null;
  updated: string;
  description: string;
  url: string;
}

export interface NewIssue {
  /** Jira project key, Linear team key or GitHub owner/repo. */
  project: string;
  /** Issue type name where the tracker has them (Jira); ignored elsewhere. */
  type?: string;
  summary: string;
  description?: string;
  /** Epic (or other parent) key the issue belongs under. */
  parent?: string;
}
