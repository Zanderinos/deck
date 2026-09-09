import { useEffect, useState } from "react";
import type { PrComment, PrDetail, PrTimelineEvent } from "../../../main/github.js";

export interface PrData {
  diffText?: string;
  detail?: PrDetail | null;
  comments: PrComment[];
  timeline: PrTimelineEvent[];
}

const empty: PrData = { comments: [], timeline: [] };

// One entry per PR, shared by every screen that shows it. A returning
// viewer sees the last loaded data at once while a fresh fetch runs.
const cache = new Map<string, PrData>();
const listeners = new Map<string, Set<(data: PrData) => void>>();

function key(repo: string, number: number): string {
  return `${repo}#${number}`;
}

function publish(k: string, patch: Partial<PrData>) {
  const next = { ...(cache.get(k) ?? empty), ...patch };
  cache.set(k, next);
  listeners.get(k)?.forEach((notify) => notify(next));
}

/** Loads the PR's diff, detail, comments and timeline, cached stale-while-revalidate. */
export function usePrData(repo: string, number: number): PrData & {
  refresh: () => void;
  refreshDiff: () => void;
  /** Optimistic local edit; the next refresh brings GitHub's view back. */
  setComments: (update: (comments: PrComment[]) => PrComment[]) => void;
} {
  const k = key(repo, number);
  const [data, setData] = useState<PrData>(() => cache.get(k) ?? empty);

  useEffect(() => {
    setData(cache.get(k) ?? empty);
    const set = listeners.get(k) ?? new Set();
    set.add(setData);
    listeners.set(k, set);
    return () => {
      set.delete(setData);
      if (set.size === 0) listeners.delete(k);
    };
  }, [k]);

  const refresh = () => {
    void window.deck.gh.prDetail(repo, number).then((detail) => publish(k, { detail }));
    void window.deck.gh.prComments(repo, number).then((comments) => publish(k, { comments }));
    void window.deck.gh.prTimeline(repo, number).then((timeline) => publish(k, { timeline }));
  };
  const refreshDiff = () => {
    void window.deck.gh.prDiff(repo, number).then((diffText) => publish(k, { diffText }));
  };

  useEffect(() => {
    refreshDiff();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const setComments = (update: (comments: PrComment[]) => PrComment[]) =>
    publish(k, { comments: update((cache.get(k) ?? empty).comments) });

  return { ...data, refresh, refreshDiff, setComments };
}
