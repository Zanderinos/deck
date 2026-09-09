import type { ReactNode } from "react";
import type { IssuePr, PrComment, PrDetail, PrTimelineEvent } from "../../../main/github.js";
import type { BoardIssue } from "../../../main/board/types.js";
import { useMemo } from "react";
import { Icon, type IconName } from "./icons.js";
import { Markdown } from "./Markdown.js";
import { TextBox, ThreadCard, threadsOf, type ThreadActions } from "./PrComments.js";
import { Avatar, checksSummary, checkTone, ExtBadge, FileName, relativeTime, Stat, toneColor } from "./prUi.js";

/** Files grouped by the folder they sit in; tests get their own group. */
function groupFiles<T extends { path: string }>(files: T[]): { name: string; files: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const name = /(^|[./_-])(test|spec|__tests__)([./_-]|$)/i.test(file.path)
      ? "Tests"
      : (file.path.split("/").slice(-2, -1)[0] ?? "root").replace(/^\w/, (c) => c.toUpperCase());
    groups.set(name, [...(groups.get(name) ?? []), file]);
  }
  return [...groups].map(([name, files]) => ({ name, files }));
}

const reviewerGlyph: Record<string, { icon: IconName; color: string; label: string }> = {
  APPROVED: { icon: "check", color: "text-green", label: "approved" },
  CHANGES_REQUESTED: { icon: "x", color: "text-red", label: "requested changes" },
  COMMENTED: { icon: "comment", color: "text-mut", label: "commented" },
  DISMISSED: { icon: "minus", color: "text-dim", label: "dismissed" },
  PENDING: { icon: "circle", color: "text-dim", label: "requested" },
};

const timelineRow = (
  e: PrTimelineEvent,
): { text: string; icon?: IconName; color?: string } => {
  const n = Number(e.detail);
  switch (e.kind) {
    case "opened":
      return { text: "opened this pull request", icon: "branch", color: "text-green" };
    case "commits":
      return { text: `pushed ${n} commit${n === 1 ? "" : "s"}`, icon: "commits" };
    case "force_pushed":
      return { text: "force-pushed the branch", icon: "commits", color: "text-orange" };
    case "review_requested":
      return { text: `requested a review from ${e.detail}`, icon: "circle" };
    case "reviewed":
      return e.detail === "APPROVED"
        ? { text: "approved", icon: "check", color: "text-green" }
        : e.detail === "CHANGES_REQUESTED"
          ? { text: "requested changes", icon: "x", color: "text-red" }
          : { text: "dismissed a review", icon: "minus" };
    case "ready_for_review":
      return { text: "marked as ready for review", icon: "circle" };
    case "auto_merge_enabled":
      return { text: "enabled auto-merge", icon: "play", color: "text-accent" };
    case "auto_merge_disabled":
      return { text: "disabled auto-merge", icon: "play" };
    case "merged":
      return { text: "merged this pull request", icon: "branch", color: "text-accent" };
    case "closed":
      return { text: "closed this pull request", icon: "x", color: "text-red" };
    case "reopened":
      return { text: "reopened this pull request", icon: "branch", color: "text-green" };
  }
};

const checksIcon = (tone: "pass" | "fail" | "pending" | "skip"): IconName =>
  tone === "pass" ? "checkSquare" : tone === "fail" ? "xSquare" : "clock";

// mergeStateStatus is what GitHub's merge box keys on; these are its words.
const branchLabel = (detail: PrDetail): { label: string; color: string } => {
  switch (detail.mergeStateStatus) {
    case "CLEAN":
    case "HAS_HOOKS":
    case "UNSTABLE":
    case "BLOCKED":
      return { label: `Up to date with ${detail.baseRefName}`, color: "text-green" };
    case "BEHIND":
      return { label: `Behind ${detail.baseRefName}`, color: "text-orange" };
    case "DIRTY":
      return { label: `Conflicts with ${detail.baseRefName}`, color: "text-red" };
    case "DRAFT":
      return { label: "Draft", color: "text-dim" };
    default:
      return { label: "Checking…", color: "text-dim" };
  }
};

const statusLabel = (detail: PrDetail): { label: string; color: string } =>
  detail.state === "MERGED"
    ? { label: "Merged", color: "text-accent" }
    : detail.state === "CLOSED"
      ? { label: "Closed", color: "text-red" }
      : detail.isDraft
        ? { label: "Draft", color: "text-dim" }
        : { label: "Open", color: "text-green" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pb-6">
      <div className="pb-2 font-sans text-[12px] text-dim">{title}</div>
      {children}
    </div>
  );
}

export interface PrOverviewProps {
  pr: IssuePr;
  detail: PrDetail | null | undefined;
  issue?: BoardIssue;
  generalComments: PrComment[];
  timeline: PrTimelineEvent[];
  commentsByPath: Map<string, PrComment[]>;
  viewed: Set<string>;
  onToggleViewed: (path: string) => void;
  onOpenFile: (path: string) => void;
  threadActions: ThreadActions;
  onComment: (body: string) => Promise<boolean>;
}

export function PrOverview({
  pr,
  detail,
  issue,
  generalComments,
  timeline,
  commentsByPath,
  viewed,
  onToggleViewed,
  onOpenFile,
  threadActions,
  onComment,
}: PrOverviewProps) {
  const checks = detail ? checksSummary(detail.checks) : undefined;
  const groups = useMemo(() => groupFiles(detail?.files ?? []), [detail]);
  const approvals = detail?.reviewers.filter((r) => r.state === "APPROVED") ?? [];
  const status = detail && statusLabel(detail);
  const branch = detail && branchLabel(detail);
  const [owner, name] = pr.repo.split("/");

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto">
      <div className="flex w-full max-w-[1400px] gap-12 px-10 py-8">
        <div className="min-w-0 flex-1 select-text">
          <h1 className="font-sans text-[22px] font-semibold leading-tight text-ink">{pr.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-sans text-[12px] text-mut">
            <Avatar name={detail?.author || pr.author} />
            <span className="text-soft">{detail?.author || pr.author}</span>
            <span className="text-dim">·</span>
            <span>
              {name}#{pr.number}
            </span>
            {detail && (
              <>
                <span className="text-dim">·</span>
                <span className="font-mono text-[11px]">
                  {detail.baseRefName} <span className="text-dim">←</span> {owner}/{detail.headRefName}
                </span>
              </>
            )}
          </div>

          <div className="mt-8 pb-2 font-sans text-[12px] text-dim">Description</div>
          {detail === null ? (
            <div className="text-[11px] text-red">Could not load this PR through gh.</div>
          ) : detail === undefined ? (
            <div className="text-[11px] text-dim">loading…</div>
          ) : (
            <div className="pr-overview-body">
              {issue && (
                <button
                  onClick={() => window.open(issue.url)}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-edge2 bg-card px-2 py-0.5 font-sans text-[12px] hover:border-edge3"
                >
                  <Icon name="issue" className="text-accent" />
                  <span className="text-mut">{issue.key}</span>
                  <span className="text-soft">{issue.summary}</span>
                </button>
              )}
              {detail.body.trim() ? (
                <Markdown>{detail.body}</Markdown>
              ) : (
                <div className="font-sans text-[12px] italic text-dim">No description.</div>
              )}
            </div>
          )}

          {detail && (
            <>
              <div className="mt-10 pb-2 font-sans text-[12px] text-dim">Activity</div>
              <div className="font-sans text-[12px] text-mut">
                {timeline.length === 0 && <div className="py-1 text-dim">loading…</div>}
                {timeline.map((e, i) => {
                  const row = timelineRow(e);
                  return (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <Avatar name={e.actor || "?"} size={16} />
                      <span>
                        <span className="text-soft">{e.actor}</span> {row.text}
                      </span>
                      {row.icon && <Icon name={row.icon} size={11} className={row.color ?? "text-dim"} />}
                      {e.date && <span className="text-dim">· {relativeTime(e.date)}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="-mx-2 mt-2">
                {threadsOf(generalComments).map((thread) => (
                  <ThreadCard key={thread[0].id} comments={thread} actions={threadActions} />
                ))}
                <div className="mx-2 my-1.5 rounded-lg border border-edge2 bg-card px-3 py-2">
                  <TextBox placeholder="Leave a comment…" sendLabel="Comment" onSend={onComment} />
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="w-[300px] shrink-0 font-sans text-[12px]">
          <Section title="Status">
            {status ? (
              <span className={`flex items-center gap-2 text-[13px] ${status.color}`}>
                <Icon name="branch" />
                <span className="text-soft">{status.label}</span>
              </span>
            ) : (
              <span className="text-dim">…</span>
            )}
          </Section>

          <Section title="Resolves">
            {issue && (
              <button
                onClick={() => window.open(issue.url)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-card"
              >
                <span className="shrink-0 font-mono text-[11px] text-accent">{issue.key}</span>
                <span className="truncate text-soft">{issue.summary}</span>
              </button>
            )}
            {detail?.linkedIssues.map((li) => (
              <button
                key={li.url}
                onClick={() => window.open(li.url)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-card"
              >
                <span className="shrink-0 font-mono text-[11px] text-green">#{li.number}</span>
                <span className="truncate text-soft">{li.title}</span>
              </button>
            ))}
            {issue === undefined && detail && detail.linkedIssues.length === 0 && (
              <span className="text-dim">Nothing linked</span>
            )}
          </Section>

          <Section title="Reviewers">
            {detail && detail.reviewers.length === 0 && <span className="text-dim">None yet</span>}
            {approvals.length > 0 && (
              <div className="pb-1 text-[11px] text-green">
                Approved by {approvals.map((r) => r.login).join(", ")}
              </div>
            )}
            {detail?.reviewers.map((r) => {
              const g = reviewerGlyph[r.state] ?? reviewerGlyph.COMMENTED;
              return (
                <div key={r.login} className="flex items-center gap-2 py-0.5" title={g.label}>
                  <Avatar name={r.login} size={16} />
                  <span className="truncate text-soft">{r.login}</span>
                  <span className={`ml-auto flex items-center gap-1 text-[11px] ${g.color}`}>
                    <Icon name={g.icon} size={11} /> {g.label}
                  </span>
                </div>
              );
            })}
          </Section>

          <Section title="Checks">
            {checks && (
              <details>
                <summary
                  className={`flex cursor-pointer list-none items-center gap-2 text-[13px] ${toneColor[checks.tone]}`}
                >
                  <Icon name={checksIcon(checks.tone)} />
                  <span className="text-soft">{checks.label}</span>
                </summary>
                <div className="mt-2 flex flex-col gap-0.5 pl-1">
                  {detail!.checks.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => c.url && window.open(c.url)}
                      disabled={!c.url}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-card disabled:cursor-default"
                    >
                      <Icon name="dot" size={11} className={toneColor[checkTone(c.state)]} />
                      <span className="truncate text-mut">{c.name}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </Section>

          <Section title="Branch">
            {branch && (
              <span className={`flex items-center gap-2 text-[13px] ${branch.color}`}>
                <Icon name="branch" />
                <span className="text-soft">{branch.label}</span>
              </span>
            )}
            {detail?.mergeable === "CONFLICTING" && (
              <div className="pt-1 text-[11px] text-red">Merge conflicts must be resolved first.</div>
            )}
            {detail?.autoMerge && (
              <div className="flex items-center gap-2 pt-2 text-[13px] text-accent">
                <Icon name="play" size={11} />
                <span className="text-soft">
                  Auto-merge on <span className="text-dim">({detail.autoMerge.method})</span>
                </span>
              </div>
            )}
          </Section>

          {detail && (
            <Section
              title={`${detail.files.length} file${detail.files.length === 1 ? "" : "s"} changed${
                viewed.size > 0 ? ` · ${viewed.size} reviewed` : ""
              }`}
            >
              <div className="flex items-center justify-between pb-1 text-[11px]">
                <span className="text-dim">
                  {detail.commits.length} commit{detail.commits.length === 1 ? "" : "s"}
                </span>
                <Stat additions={detail.additions} deletions={detail.deletions} />
              </div>
              {groups.map((group) => {
                const adds = group.files.reduce((n, f) => n + f.additions, 0);
                const dels = group.files.reduce((n, f) => n + f.deletions, 0);
                return (
                  <div key={group.name} className="pb-2">
                    <div className="flex items-center justify-between py-1 text-[11px]">
                      <span className="text-soft">
                        {group.name} <span className="text-dim">{group.files.length}</span>
                      </span>
                      <Stat additions={adds} deletions={dels} />
                    </div>
                    {group.files.map((f) => {
                      const threads = threadsOf(commentsByPath.get(f.path) ?? []);
                      const open = threads.filter((t) => !t[0].resolved && !t[0].outdated).length;
                      return (
                        <div
                          key={f.path}
                          className={`flex items-center gap-2 rounded px-1 py-1 hover:bg-card ${
                            viewed.has(f.path) ? "opacity-50" : ""
                          }`}
                          title={f.path}
                        >
                          <input
                            type="checkbox"
                            checked={viewed.has(f.path)}
                            onChange={() => onToggleViewed(f.path)}
                            className="h-3 w-3 shrink-0 accent-green"
                            title="Reviewed"
                          />
                          <button
                            onClick={() => onOpenFile(f.path)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <ExtBadge path={f.path} />
                            <FileName path={f.path} className="flex-1" />
                          </button>
                          {threads.length > 0 && (
                            <span
                              className={`flex items-center gap-0.5 text-[10px] ${open > 0 ? "text-orange" : "text-dim"}`}
                            >
                              <Icon name="comment" size={10} />
                              {open > 0 ? open : threads.length}
                            </span>
                          )}
                          <Stat additions={f.additions} deletions={f.deletions} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
