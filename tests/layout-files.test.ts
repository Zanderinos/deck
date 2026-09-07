import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { paneIds, paneRects, pruneLayout, splitPane } from "../src/renderer/src/terminal/layout.js";
import { listFiles, readLocalFile, saveLocalFile } from "../src/main/files.js";

describe("split layout", () => {
  it("keeps nested panes and their geometry when an unrelated pane closes", () => {
    const pair = splitPane({ termId: "one" }, "one", "two", "row");
    const nested = splitPane(pair, "two", "three", "column");
    expect(paneIds(nested)).toEqual(["one", "two", "three"]);
    expect(paneRects(nested)).toEqual([
      { termId: "one", left: 0, top: 0, width: 50, height: 100 },
      { termId: "two", left: 50, top: 0, width: 50, height: 50 },
      { termId: "three", left: 50, top: 50, width: 50, height: 50 },
    ]);
    const surviving = pruneLayout(nested, new Set(["one", "three"]));
    expect(paneRects(surviving!)[1]).toEqual({ termId: "three", left: 50, top: 0, width: 50, height: 100 });
    expect(pruneLayout(nested, new Set())).toBeUndefined();
  });
});

describe("local file explorer", () => {
  it("browses and edits text, preventing traversal, symlink escape and stale writes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-files-"));
    try {
      const root = path.join(dir, "project");
      await fs.mkdir(root);
      await fs.writeFile(path.join(root, "notes.md"), "original");
      await fs.writeFile(path.join(dir, "outside.txt"), "outside");
      await fs.symlink(path.join(dir, "outside.txt"), path.join(root, "link.txt"));
      expect((await listFiles(root)).map((entry) => entry.name)).toEqual(["link.txt", "notes.md"]);
      const loaded = await readLocalFile(root, "notes.md");
      const saved = await saveLocalFile(root, "notes.md", { ...loaded, text: "updated" });
      expect((await readLocalFile(root, "notes.md")).text).toBe("updated");
      await expect(readLocalFile(root, "../outside.txt")).rejects.toThrow("outside");
      await expect(readLocalFile(root, "link.txt")).rejects.toThrow("outside");
      await expect(saveLocalFile(root, "notes.md", { text: "old", modified: saved.modified - 1000 })).rejects.toThrow("changed on disk");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
