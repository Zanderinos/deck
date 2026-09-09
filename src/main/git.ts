import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Working-tree changes for the review panel: everything not yet pushed to a
// commit — staged, unstaged, and untracked — as one unified diff.

export interface WorkingChanges {
  /** Unified diff text, empty when the tree is clean. */
  diff: string;
  /** Set when the cwd is not a git repo (or git failed). */
  error?: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", cwd, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function workingChanges(rawCwd: string): Promise<WorkingChanges> {
  const cwd = expandHome(rawCwd);
  try {
    await git(cwd, ["rev-parse", "--git-dir"]);
  } catch {
    return { diff: "", error: `not a git repository: ${cwd}` };
  }

  try {
    const tracked = await git(cwd, ["diff", "HEAD"]);
    const untracked = (await git(cwd, ["ls-files", "--others", "--exclude-standard"]))
      .split("\n")
      .filter(Boolean)
      .slice(0, 50);

    const untrackedDiffs = await Promise.all(
      untracked.map((file) =>
        // --no-index exits 1 when files differ, which they always do here.
        git(cwd, ["diff", "--no-index", "--", "/dev/null", file]).catch(
          (err: { stdout?: string }) => err.stdout ?? "",
        ),
      ),
    );
    return { diff: [tracked, ...untrackedDiffs].filter(Boolean).join("\n") };
  } catch (err) {
    return { diff: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export interface GitSummary {
  branch: string;
  added: number;
  removed: number;
  changedFiles: number;
}

const summaries = new Map<string, { expires: number; result: Promise<GitSummary | null> }>();

export function gitSummary(cwd: string): Promise<GitSummary | null> {
  const cached = summaries.get(cwd);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = Promise.all([
    git(expandHome(cwd), ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(expandHome(cwd), ["diff", "--numstat", "HEAD"]),
    git(expandHome(cwd), ["status", "--porcelain"]),
  ]).then(([branch, diff, status]) => {
    const counts = diff.split("\n").reduce((sum, line) => {
      const [added, removed] = line.split("\t");
      return { added: sum.added + (Number(added) || 0), removed: sum.removed + (Number(removed) || 0) };
    }, { added: 0, removed: 0 });
    return { branch: branch.trim(), ...counts, changedFiles: status.split("\n").filter(Boolean).length };
  }).catch(() => null);
  summaries.set(cwd, { expires: Date.now() + 4000, result });
  return result;
}

/** Local branches, most recently committed to first. */
export function gitBranches(cwd: string): Promise<string[]> {
  return git(expandHome(cwd), ["branch", "--format=%(refname:short)", "--sort=-committerdate"])
    .then((stdout) => stdout.split("\n").filter(Boolean))
    .catch(() => []);
}
