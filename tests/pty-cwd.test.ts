import { describe, expect, it } from "vitest";
import { parseLsofCwds } from "../src/main/ptyCwd.js";

describe("parseLsofCwds", () => {
  it("reads the cwd of every reported pid", () => {
    const cwds = parseLsofCwds("p412\nfcwd\nn/Users/me/www/deck\np413\nfcwd\nn/Users/me/www\n");
    expect(cwds.get(412)).toBe("/Users/me/www/deck");
    expect(cwds.get(413)).toBe("/Users/me/www");
  });

  it("keeps paths containing spaces and newline-free noise intact", () => {
    expect(parseLsofCwds("p7\nfcwd\nn/Users/me/My Projects/app\n").get(7)).toBe("/Users/me/My Projects/app");
  });

  it("ignores pids lsof could not inspect", () => {
    expect(parseLsofCwds("p1\np2\nfcwd\nn/tmp\n")).toEqual(new Map([[2, "/tmp"]]));
  });

  it("returns nothing for empty output", () => {
    expect(parseLsofCwds("")).toEqual(new Map());
  });
});
