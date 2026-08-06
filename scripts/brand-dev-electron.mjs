// Dev mode runs the stock Electron.app from node_modules, so macOS shows
// "Electron" in the dock and Cmd-Tab. Rebrand that bundle in place: name,
// icon, and an ad-hoc re-sign (editing Info.plist breaks the original
// signature, and unsigned binaries won't launch on Apple Silicon).
// Runs on postinstall; a fresh `yarn install` restores stock Electron first.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

if (process.platform !== "darwin") process.exit(0);

const root = path.dirname(import.meta.dirname);
const appDir = path.join(root, "node_modules/electron/dist/Electron.app");
const plist = path.join(appDir, "Contents/Info.plist");
const icns = path.join(root, "resources/icon.icns");

if (!existsSync(plist) || !existsSync(icns)) process.exit(0);

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
  run(`/usr/libexec/PlistBuddy -c 'Set :${key} deck' '${plist}'`);
}
copyFileSync(icns, path.join(appDir, "Contents/Resources/electron.icns"));
run(`codesign --force --deep --sign - '${appDir}'`);
console.log("branded dev Electron.app as deck");
