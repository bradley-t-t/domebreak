#!/usr/bin/env node
// Dev-only cosmetic fix for the macOS menu-bar app name.
//
// Dev runs the unpackaged Electron binary (node_modules/electron/dist/Electron.app),
// whose CFBundleName is "Electron"; macOS reads the menu-bar title from that
// bundle's Info.plist and app.setName() can't override it (electron/electron#18463).
// This rewrites the bundle's display-name keys to "DomeBreak" so the menu bar
// reads right in dev. Packaged builds get the name from electron-builder's
// productName, so this only ever touches node_modules.
//
// Wired to postinstall, so it re-applies after every npm install. Idempotent,
// and a silent no-op off macOS or when the binary is absent (CI, Windows).
const {execFileSync} = require("node:child_process");
const {existsSync} = require("node:fs");
const path = require("node:path");

const NAME = "DomeBreak";

if (process.platform !== "darwin") process.exit(0);

const app = path.join(__dirname, "..", "node_modules", "electron", "dist", "Electron.app");
const plist = path.join(app, "Contents", "Info.plist");
if (!existsSync(plist)) process.exit(0);

// CFBundleExecutable stays "Electron" — the binary name must not change, only
// the human-facing display names the menu bar reads.
const set = (key) => {
    try {
        execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${NAME}`, plist]);
    } catch {
        try {
            execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${NAME}`, plist]);
        } catch { /* PlistBuddy missing or key unwritable — leave it, non-fatal */ }
    }
};

set("CFBundleName");
set("CFBundleDisplayName");

// Bump the bundle mtime so LaunchServices re-reads the plist on next launch
// instead of serving a cached "Electron" name.
try {
    execFileSync("touch", [app]);
} catch { /* non-fatal */ }

// A plist rewrite alone is not enough: the macOS Dock and Cmd-Tab switcher read
// the app's display name from the LaunchServices database, which caches the old
// "Electron" name and ignores an mtime bump. Force LaunchServices to re-register
// this bundle so the Dock label picks up the new CFBundleName on next launch.
const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework"
    + "/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister";
if (existsSync(LSREGISTER)) {
    try {
        execFileSync(LSREGISTER, ["-f", app]);
    } catch { /* non-fatal — Dock name will refresh after a cache rebuild */ }
}
