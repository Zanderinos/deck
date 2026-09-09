import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Agent } from "../shared/agents.js";
import type { TermMeta } from "./ptyHost.js";

const exec = promisify(execFile);

// Detached hosts can outlive the version of Deck that started them.
// Older hosts do not report foreground processes, but their agents still
// inherit DECK_TERM_ID, which lets the main process identify them.
export class LegacyAgentDetector {
  private readonly processTerms = new Map<string, string | undefined>();
  private previous = new Map<string, Agent>();

  async scan(terms: TermMeta[]): Promise<TermMeta[]> {
    const legacyTerms = terms.filter((term) => term.foregroundProcess === undefined);
    if (legacyTerms.length === 0) {
      this.processTerms.clear();
      this.previous.clear();
      return [];
    }
    const { stdout } = await exec("/bin/ps", ["-axo", "pid=,pgid=,tpgid=,comm="], { timeout: 2000 });
    const candidates = stdout.split("\n").flatMap<{ pid: string; agent: Agent }>((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(.+?)\s*$/.exec(line);
      if (!match || match[2] !== match[3]) return [];
      const agent = match[4].split("/").pop();
      return agent === "codex" || agent === "claude" ? [{ pid: match[1], agent }] : [];
    });
    const livePids = new Set(candidates.map(({ pid }) => pid));
    for (const pid of this.processTerms.keys()) if (!livePids.has(pid)) this.processTerms.delete(pid);

    const detected = new Map<string, Agent>();
    for (const { pid, agent } of candidates) {
      if (!this.processTerms.has(pid)) this.processTerms.set(pid, await this.termForProcess(pid));
      const termId = this.processTerms.get(pid);
      if (termId) detected.set(termId, agent);
    }
    const changes = legacyTerms.flatMap((term) => {
      const agent = detected.get(term.id);
      return agent === this.previous.get(term.id) ? [] : [{ ...term, foregroundProcess: agent ?? "" }];
    });
    this.previous = detected;
    return changes;
  }

  private async termForProcess(pid: string): Promise<string | undefined> {
    try {
      const { stdout } = await exec("/bin/ps", ["eww", "-p", pid, "-o", "command="], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 });
      return /(?:^|\s)DECK_TERM_ID=([^\s]+)/.exec(stdout)?.[1];
    } catch (error) {
      // A process can exit between the snapshot and its environment read.
      if ((error as { code?: number }).code === 1) return undefined;
      throw error;
    }
  }
}
