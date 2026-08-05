import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import type { DeckSettings } from "../shared/settings.js";
import { killTermsOf, registerPtyIpc } from "./pty.js";
import { getSettings, updateSettings } from "./settings.js";

let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let registeredHotkey: string | undefined;

// Single instance: a second `deck` just summons the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: "#0c0c0e",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      // ESM preload scripts require an unsandboxed renderer.
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win?.show());
  win.on("closed", () => (win = undefined));
  // Reloads (dev HMR full reload, ⌘R) orphan the renderer's terminals.
  const contents = win.webContents;
  contents.on("did-start-navigation", ({ isSameDocument }) => {
    if (!isSameDocument) killTermsOf(contents);
  });
  win.webContents.on("render-process-gone", () => win && killTermsOf(win.webContents));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }
  return win;
}

function showWindow(): void {
  const w = win ?? createWindow();
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  app.focus({ steal: true });
}

/** Warp-style quake panel: full width, docked to the top of the screen the
 *  cursor is on. The window itself persists, so it reopens where you left. */
function dockToTop(w: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const ratio = getSettings().summonHeightRatio;
  w.setBounds({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: Math.round(workArea.height * Math.min(Math.max(ratio, 0.2), 1)),
  });
}

function toggleWindow(): void {
  if (win?.isVisible() && win.isFocused()) {
    win.hide();
    app.hide();
  } else {
    const w = win ?? createWindow();
    dockToTop(w);
    showWindow();
  }
}

function registerHotkey(accelerator: string): boolean {
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  const ok = globalShortcut.register(accelerator, toggleWindow);
  registeredHotkey = ok ? accelerator : undefined;
  return ok;
}

function createTray(): void {
  // macOS allows a text-only tray item; an empty image keeps it icon-less.
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("▤");
  tray.setToolTip("deck");
  tray.on("click", toggleWindow);
}

app.whenReady().then(() => {
  registerPtyIpc();
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", (_e, patch: Partial<DeckSettings>) => {
    const next = updateSettings(patch);
    if (patch.summonHotkey) registerHotkey(next.summonHotkey);
    return next;
  });

  createWindow();
  createTray();
  registerHotkey(getSettings().summonHotkey);

  app.on("activate", () => showWindow());
});

// deck lives in the tray; closing the window must not quit the app.
app.on("window-all-closed", () => {});

app.on("will-quit", () => globalShortcut.unregisterAll());
