import { useMemo } from "react";
import type { BoardIssue } from "../../../main/board/types.js";

// Filtering runs on the normalised card, never on a tracker's own shape, so
// the same bar serves Jira, Linear and GitHub. A facet whose field no tracker
// filled in has nothing to offer and never renders.

const FACETS = [{ field: "type", label: "Type" }] as const;

type FacetField = (typeof FACETS)[number]["field"];

export interface BoardFilters {
  text: string;
  mineOnly: boolean;
  facets: Partial<Record<FacetField, string>>;
}

export const noBoardFilters: BoardFilters = { text: "", mineOnly: false, facets: {} };

export function boardFiltersActive(filters: BoardFilters): boolean {
  return Boolean(filters.text || filters.mineOnly || Object.values(filters.facets).some(Boolean));
}

export function filterBoardIssues(
  issues: BoardIssue[],
  filters: BoardFilters,
  myAccountId?: string,
): BoardIssue[] {
  const text = filters.text.trim().toLowerCase();
  return issues.filter((issue) => {
    if (filters.mineOnly && myAccountId && issue.assigneeId !== myAccountId) return false;
    for (const { field } of FACETS) {
      const wanted = filters.facets[field];
      if (wanted && issue[field] !== wanted) return false;
    }
    if (!text) return true;
    return `${issue.key} ${issue.summary} ${issue.assignee ?? ""}`.toLowerCase().includes(text);
  });
}

const chip = "rounded-md border border-edge2 bg-card px-2 py-1 text-[11px] outline-none focus:border-accent";

export function BoardFilterBar({ issues, filters, onChange, canFilterMine, shown }: {
  /** Every card on the board: the options stay put as the filters narrow it. */
  issues: BoardIssue[];
  filters: BoardFilters;
  onChange: (patch: Partial<BoardFilters>) => void;
  canFilterMine: boolean;
  shown: number;
}) {
  const facets = useMemo(
    () =>
      FACETS.map((facet) => ({
        ...facet,
        values: [...new Set(issues.map((issue) => issue[facet.field]).filter(Boolean))].sort() as string[],
      })).filter((facet) => facet.values.length > 1),
    [issues],
  );

  return (
    <div className="flex items-center gap-2 border-b border-edge px-6 py-2">
      <input
        value={filters.text}
        onChange={(event) => onChange({ text: event.target.value })}
        placeholder="Filter cards…"
        aria-label="Filter cards"
        className={`w-52 ${chip} text-ink placeholder:text-mut`}
      />
      {facets.map((facet) => {
        const value = filters.facets[facet.field] ?? "";
        return (
          <select
            key={facet.field}
            value={value}
            aria-label={facet.label}
            onChange={(event) => onChange({ facets: { ...filters.facets, [facet.field]: event.target.value } })}
            className={`${chip} ${value ? "text-accent" : "text-dim"}`}
          >
            <option value="">{facet.label}: all</option>
            {facet.values.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      })}
      {canFilterMine && (
        <button
          onClick={() => onChange({ mineOnly: !filters.mineOnly })}
          title="Show only issues assigned to me"
          className={`${chip} ${filters.mineOnly ? "text-accent" : "text-dim hover:text-ink"}`}
        >
          {filters.mineOnly ? "● my tasks" : "○ my tasks"}
        </button>
      )}
      {boardFiltersActive(filters) && (
        <>
          <button onClick={() => onChange(noBoardFilters)} className="text-[11px] text-dim hover:text-ink">
            clear
          </button>
          <span className="ml-auto text-[11px] text-dim">
            {shown} of {issues.length}
          </span>
        </>
      )}
    </div>
  );
}
