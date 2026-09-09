import { describe, expect, it } from "vitest";
import { parseInstalledVersions } from "../src/main/projectRuntime.js";

describe("parseInstalledVersions", () => {
  it("takes the installed versions and skips nvm's alias lines", () => {
    const listing = [
      "       v22.20.0",
      "->     v24.18.0",
      "        system",
      "default -> 24 (-> v24.18.0)",
      "iojs -> N/A (default)",
      "node -> stable (-> v24.18.0) (default)",
      "lts/argon -> v4.9.1 (-> N/A)",
      "lts/krypton -> v24.18.0",
    ].join("\n");
    expect(parseInstalledVersions(listing)).toEqual(["v24.18.0", "v22.20.0"]);
  });

  it("reads an fnm listing", () => {
    expect(parseInstalledVersions("* v20.11.0 default\n* v22.20.0\n")).toEqual(["v22.20.0", "v20.11.0"]);
  });

  it("orders by version, not by line", () => {
    expect(parseInstalledVersions("v9.1.0\nv10.0.0\nv9.11.2\n")).toEqual(["v10.0.0", "v9.11.2", "v9.1.0"]);
  });

  it("finds nothing in an empty or failed listing", () => {
    expect(parseInstalledVersions("")).toEqual([]);
    expect(parseInstalledVersions("command not found: nvm\n")).toEqual([]);
  });
});
