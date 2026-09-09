import { describe, expect, it } from "vitest";
import { TipAdvisor, tipRules, trackTypedInput } from "../src/shared/tips.js";

const context = { defaultAgent: "claude" as const };

describe("trackTypedInput", () => {
  it("collects keystrokes and submits the line on Enter", () => {
    let input = trackTypedInput("", "cla");
    input = trackTypedInput(input.typed, "ude");
    expect(input).toEqual({ typed: "claude" });
    expect(trackTypedInput(input.typed, "\r")).toEqual({ typed: "", submitted: "claude" });
  });

  it("honours backspace and a cancelled line", () => {
    expect(trackTypedInput("claudx", "\x7fe")).toEqual({ typed: "claude" });
    expect(trackTypedInput("claude", "\x03")).toEqual({ typed: "" });
    expect(trackTypedInput("claude", "\x15ls\r")).toEqual({ typed: "", submitted: "ls" });
  });

  it("ignores escape sequences and takes the content of a bracketed paste", () => {
    expect(trackTypedInput("", "\x1b[A\x1b[3~")).toEqual({ typed: "" });
    expect(trackTypedInput("", "\x1b[200~codex --help\x1b[201~\r")).toEqual({ typed: "", submitted: "codex --help" });
  });
});

describe("TipAdvisor", () => {
  it("gives every rule a distinct id", () => {
    expect(new Set(tipRules.map((rule) => rule.id)).size).toBe(tipRules.length);
  });

  it("maps a typed command to the page or shortcut deck has for it", () => {
    const advisor = new TipAdvisor();
    expect(advisor.advise({ command: "claude" }, context)?.id).toBe("agent-tab");
    expect(advisor.advise({ command: "codex --model o3" }, { defaultAgent: "codex" })?.message).toContain("Codex tab");
    expect(advisor.advise({ command: "claude --resume abc" }, context)?.id).toBe("resume-session");
    expect(advisor.advise({ command: "codex resume abc" }, context)?.id).toBe("resume-session");
    expect(advisor.advise({ command: "git status" }, context)?.id).toBe("changes-panel");
    expect(advisor.advise({ command: "git diff --stat" }, context)?.id).toBe("changes-panel");
    expect(advisor.advise({ command: "ls -la" }, context)?.id).toBe("file-explorer");
    expect(advisor.advise({ command: "gh pr checks 12" }, context)?.id).toBe("pr-pages");
  });

  it("stays quiet for commands deck has nothing to add to", () => {
    const advisor = new TipAdvisor();
    for (const command of ["lsof", "claude-config", "git claude", "git push", "gh pr create", ""]) {
      expect(advisor.advise({ command }, context)).toBeUndefined();
    }
  });

  it("waits for a mouse action to repeat before suggesting its key, then says it once", () => {
    const advisor = new TipAdvisor();
    expect(advisor.advise({ action: "split-button" }, context)).toBeUndefined();
    expect(advisor.advise({ action: "split-button" }, context)?.id).toBe("split-keys");
    expect(advisor.advise({ action: "split-button" }, context)).toBeUndefined();
  });

  it("counts each action on its own", () => {
    const advisor = new TipAdvisor();
    advisor.advise({ action: "new-tab-button" }, context);
    advisor.advise({ action: "new-tab-button" }, context);
    expect(advisor.advise({ action: "close-tab-button" }, context)).toBeUndefined();
    expect(advisor.advise({ action: "new-tab-button" }, context)?.id).toBe("new-tab-key");
  });
});
