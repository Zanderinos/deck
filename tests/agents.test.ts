import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { agentCommand, sessionAgent, sessionKey } from "../src/shared/agents.js";

describe("agent commands", () => {
  it("resumes each provider using its own CLI syntax and raw id", () => {
    expect(agentCommand({ agent: "codex", sessionId: "codex:abc" })).toBe("codex resume 'abc'");
    expect(agentCommand({ sessionId: "abc" })).toBe("claude --resume 'abc'");
    expect(sessionAgent(sessionKey("codex", "abc"))).toBe("codex");
  });
  it("passes multiline prompts literally through a real shell", () => {
    const prompt = "-option 'quoted' \"double\" `pwd` $(pwd) $HOME\nsecond line";
    for (const agent of ["codex", "claude"] as const) {
      const command = agentCommand({ agent, prompt });
      const output = execFileSync("/bin/sh", ["-c", `${agent}() { printf '%s\\n' "$@"; }; ${command}`], { encoding: "utf8" });
      expect(output).toBe(`--\n${prompt}\n`);
    }
  });
});
