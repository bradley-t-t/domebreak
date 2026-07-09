#!/usr/bin/env node
// Dev-only cosmetic fix for the macOS menu-bar app name.
//
// In development we launch the game with the unpackaged Electron binary from
// node_modules (electron/dist/Electron.app). That bundle's CFBundleName is
// literally "Electron", and macOS reads the menu-bar application-menu title
// straight from the running bundle's Info.plist — app.setName() in the main
// process cannot override it for an unpackaged run (electron/electron#18463).
// So the menu bar shows "Electron" instead of the product name.
//
// This rewrites the dev bundle's display-name keys to the product name so the
// menu bar reads "DomeBreak" during development. The packaged build already
// gets the correct name from electron-builder's `productName`, so this only
// ever touches node_modules and never affects a shipped artifact.
//
// Wired to `postinstall`, so it re-applies after every `npm install`.
// Idempotent, and a silent no-op off macOS or when the binary is absent
// (e.g. CI, Windows install, before deps are present).
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
