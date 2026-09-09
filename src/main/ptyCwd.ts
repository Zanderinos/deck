import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

// A shell's working directory changes with every cd, and nothing in the pty
// protocol reports it. Reading it from the process itself keeps the terminal
// chrome (folder, branch, diff) honest without needing shell integration.

/** Parses `lsof -Fpn -a -d cwd` output into the cwd of each reported pid. */
export function parseLsofCwds(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1)) || undefined;
    else if (line.startsWith("n") && pid !== undefined) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

export async function readCwds(pids: number[]): Promise<Map<number, string>> {
  if (!pids.length) return new Map();
  if (process.platform !== "darwin") {
    const entries = await Promise.all(
      pids.map(async (pid) => [pid, await fs.readlink(`/proc/${pid}/cwd`).catch(() => "")] as const),
    );
    return new Map(entries.filter(([, cwd]) => cwd));
  }
  // lsof exits non-zero when it cannot inspect one of the pids, but still
  // prints the ones it could.
  const { stdout } = await exec("lsof", ["-a", "-d", "cwd", "-Fpn", "-p", pids.join(",")])
    .catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "" }));
  return parseLsofCwds(stdout);
}
