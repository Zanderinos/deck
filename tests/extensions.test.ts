import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { builtInThemes, parseTheme } from "../src/shared/themes.js";
import { parsePluginAction } from "../src/shared/extensions.js";

const fixture = vi.hoisted(() => ({ root: "", settings: new Map<string, unknown>() }));
vi.mock("electron", () => ({ app: { getPath: () => fixture.root }, dialog: {}, shell: {} }));
vi.mock("../src/main/db.js", () => ({ kvGet: (key: string) => fixture.settings.get(key), kvSet: (key: string, value: unknown) => fixture.settings.set(key, value) }));
import { enablePlugin, extensionCatalog, loadPlugin, pluginFile, saveTheme } from "../src/main/extensions.js";
fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-extensions-"));
afterAll(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

describe("custom themes", () => {
  it("inherits light colors, follows UI overrides in terminals, and persists a reloadable custom theme", () => {
    const theme = parseTheme({ id: "test-paper", name: "Test Paper", extends: "light", colors: { bg: "#ffffff", accent: "#123456" }, terminal: { red: "#990000" } });
    expect(theme.appearance).toBe("light");
    expect(theme.colors.ink).toBe(builtInThemes[4].colors.ink);
    expect(theme.terminal).toMatchObject({ background: "#ffffff", cursor: "#123456", red: "#990000" });
    expect(saveTheme(theme).id).toBe("custom:test-paper");
    expect(extensionCatalog().themes.find((candidate) => candidate.id === "custom:test-paper")?.terminal).toEqual(theme.terminal);
  });
  it("rejects invalid styles, traversal ids and malformed palettes without losing other themes", () => {
    for (const patch of [{ id: "../escape" }, { appearance: "system" }, { extends: "absent" }, { colors: { accent: "url(file:///etc/passwd)" } }, { colors: { missing: "#fff" } }, { terminal: [] }]) {
      expect(() => parseTheme({ id: "valid", name: "Valid", ...patch })).toThrow();
    }
    fs.writeFileSync(path.join(fixture.root, "themes", "broken.json"), "{");
    const catalog = extensionCatalog();
    expect(catalog.errors[0]).toContain("broken.json");
    expect(catalog.themes.some((theme) => theme.id === "custom:test-paper")).toBe(true);
  });
});

describe("local plugins", () => {
  it("loads the real starter, discovers it, and removes contributions when disabled", () => {
    const destination = path.join(fixture.root, "plugins", "workspace-kit");
    fs.cpSync(path.resolve("examples/plugins/workspace-kit"), destination, { recursive: true });
    const plugin = loadPlugin(destination);
    expect(plugin.commands.map((command) => command.action?.type)).toEqual(["theme", "terminal", "terminal"]);
    expect(plugin.source).toContain("registerCommand");
    expect(plugin.themes[0].id).toBe("workspace-kit:ocean");
    expect(extensionCatalog().plugins[0].enabled).toBe(true);
    enablePlugin(destination, false);
    expect(extensionCatalog().plugins[0]).toMatchObject({ enabled: false, themes: [], source: undefined });
    expect(extensionCatalog().themes.some((theme) => theme.id === "workspace-kit:ocean")).toBe(false);
    enablePlugin(destination, true);
    expect(extensionCatalog().themes.some((theme) => theme.id === "workspace-kit:ocean")).toBe(true);
  });
  it("rejects escaping plugin assets, duplicate commands and unsupported actions", () => {
    const root = path.join(fixture.root, "bad-plugin");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(fixture.root, "outside.js"), "export default () => {}");
    fs.symlinkSync(path.join(fixture.root, "outside.js"), path.join(root, "escape.js"));
    expect(() => pluginFile(root, "../outside.js")).toThrow("inside");
    expect(() => pluginFile(root, "escape.js")).toThrow("inside");
    fs.writeFileSync(path.join(root, "deck-plugin.json"), JSON.stringify({ apiVersion: 1, id: "bad", name: "Bad", version: "1", commands: [{ id: "same", title: "One" }, { id: "same", title: "Two" }] }));
    expect(() => loadPlugin(root)).toThrow("Duplicate");
    expect(() => parsePluginAction({ type: "terminal", agent: "unknown" })).toThrow("agent");
    expect(() => parsePluginAction({ type: "execute", code: "process.exit()" })).toThrow("Unsupported");
  });
});
