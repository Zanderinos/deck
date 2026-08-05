import { rgPath } from "@vscode/ripgrep";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getSettings } from "./settings.js";

const exec = promisify(execFile);

// Fallback search tiers for when the conversation index isn't what you were
// looking for: ripgrep over configured repo roots, then GitHub via gh.

export interface RepoHit {
  file: string;
  line: number;
  text: string;
  root: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function searchRepos(query: string): Promise<RepoHit[]> {
  const roots = getSettings().repoRoots.map(expandHome);
  const hits: RepoHit[] = [];
  for (const root of roots) {
    try {
      const { stdout } = await exec(
        rgPath, // bundled ripgrep: no PATH assumptions on user machines
        [
          "--no-heading",
          "--line-number",
          "--smart-case",
          "--max-count=2",
          "--max-filesize=1M",
          "--max-columns=250",
          "-g",
          "!node_modules",
          "-g",
          "!dist",
          query,
          root,
        ],
        { maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
      );
      for (const line of stdout.split("\n")) {
        const m = /^(.+?):(\d+):(.*)$/.exec(line);
        if (!m) continue;
        hits.push({ file: m[1], line: Number(m[2]), text: m[3].trim().slice(0, 200), root });
        if (hits.length >= 60) return hits;
      }
    } catch {
      // rg exits 1 on no matches, 127 when missing — either way this root has nothing.
    }
  }
  return hits;
}

export interface RepoDir {
  name: string;
  path: string;
}

/** The repositories under the configured roots (for the search overlay). */
export function listRepos(): RepoDir[] {
  const repos: RepoDir[] = [];
  for (const root of getSettings().repoRoots.map(expandHome)) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".")) {
        repos.push({ name: e.name, path: path.join(root, e.name) });
      }
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export interface GithubHit {
  kind: "pr" | "issue";
  title: string;
  repository: string;
  number: number;
  state: string;
  url: string;
  updatedAt: string;
}

interface GhSearchRow {
  title: string;
  number: number;
  state: string;
  url: string;
  updatedAt: string;
  repository?: { nameWithOwner?: string };
}

async function ghSearch(kind: "prs" | "issues", query: string): Promise<GithubHit[]> {
  try {
    const { stdout } = await exec(
      "gh",
      ["search", kind, query, "--limit", "10", "--json", "title,number,state,url,updatedAt,repository"],
      { timeout: 20_000 },
    );
    return (JSON.parse(stdout) as GhSearchRow[]).map((r) => ({
      kind: kind === "prs" ? "pr" : "issue",
      title: r.title,
      number: r.number,
      state: r.state,
      url: r.url,
      updatedAt: r.updatedAt,
      repository: r.repository?.nameWithOwner ?? "",
    }));
  } catch {
    return [];
  }
}

export async function searchGithub(query: string): Promise<GithubHit[]> {
  const [prs, issues] = await Promise.all([ghSearch("prs", query), ghSearch("issues", query)]);
  return [...prs, ...issues];
}
