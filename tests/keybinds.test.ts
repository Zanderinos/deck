import { describe, expect, it } from "vitest";
import { acceleratorOf, chordOf, defaultKeybinds, formatAccelerator, formatChord, matchKeybind, resolveKeybinds } from "../src/shared/keybinds.js";

const press = (over: Partial<Parameters<typeof chordOf>[0]>) => ({ key: "", code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });

describe("keybinds", () => {
  it("builds chords from the physical key so ⌥3 does not become £", () => {
    expect(chordOf(press({ key: "£", code: "Digit3", metaKey: true, altKey: true }))).toBe("Meta+Alt+Digit3");
    expect(chordOf(press({ key: "t", code: "KeyT", metaKey: true, shiftKey: true }))).toBe("Meta+Shift+T");
    expect(chordOf(press({ key: ",", code: "Comma", metaKey: true }))).toBe("Meta+,");
    expect(chordOf(press({ key: "Enter", code: "Enter", metaKey: true, shiftKey: true }))).toBe("Meta+Shift+Enter");
  });

  it("ignores bare modifier presses", () => {
    expect(chordOf(press({ key: "Meta", code: "MetaLeft", metaKey: true }))).toBeUndefined();
  });

  it("matches overrides over defaults", () => {
    const keybinds = resolveKeybinds({ search: "Ctrl+Space" });
    expect(matchKeybind(keybinds, press({ key: " ", code: "Space", ctrlKey: true }))).toBe("search");
    expect(matchKeybind(keybinds, press({ key: "k", code: "KeyK", metaKey: true }))).toBeUndefined();
    expect(matchKeybind(keybinds, press({ key: "w", code: "KeyW", metaKey: true }))).toBe("tab.close");
    expect(matchKeybind(keybinds, press({ key: "t", code: "KeyT", metaKey: true, shiftKey: true }))).toBe("tab.reopen");
    expect(matchKeybind(keybinds, press({ key: "n", code: "KeyN", metaKey: true, shiftKey: true }))).toBe("tab.newAgent");
    expect(matchKeybind(keybinds, press({ key: "n", code: "KeyN", metaKey: true }))).toBe("window.new");
  });

  it("turns chords into electron accelerators", () => {
    expect(acceleratorOf("Meta+,")).toBe("CommandOrControl+,");
    expect(acceleratorOf("Meta+Alt+Digit2")).toBe("CommandOrControl+Alt+2");
    expect(acceleratorOf(defaultKeybinds.zen)).toBe("CommandOrControl+Shift+Return");
    expect(acceleratorOf("Ctrl+Tab")).toBe("Control+Tab");
    expect(acceleratorOf("F5")).toBeUndefined();
  });

  it("formats chords with mac symbols", () => {
    expect(formatChord(defaultKeybinds.zen)).toBe("⌘⇧⏎");
    expect(formatChord("Meta+Alt+Digit1")).toBe("⌘⌥1");
    expect(formatChord("Ctrl+Space")).toBe("⌃space");
  });

  it("formats the summon accelerator with mac symbols", () => {
    expect(formatAccelerator("Alt+Space")).toBe("⌥space");
    expect(formatAccelerator("CommandOrControl+Shift+Space")).toBe("⌘⇧space");
    expect(formatAccelerator(acceleratorOf("Meta+Alt+Digit1") ?? "")).toBe("⌘⌥1");
    expect(formatAccelerator("Control+Return")).toBe("⌃⏎");
  });
});
