// In-app auto-updater for the packaged desktop builds. The release pipeline
// publishes every installer under a stable per-platform name on
// download.domebreak.com under a stable per-platform name, so updating is:
// download this build's own artifact, reinstall it in place, relaunch.
//
//   • Windows — the NSIS installer electron-builder produces already knows how
//     to update a live install: run it with /S (silent) plus the builder's
//     --updated/--force-run flags and it replaces the app and relaunches it.
//   • macOS  — no Developer ID is configured (the bundle is ad-hoc signed by
//     build/afterPack.cjs), which rules Squirrel.Mac out: its signature check
//     pins the exact ad-hoc seal, so any new build fails validation. Instead:
//     mount the dmg, verify the new bundle's seal and version, swap it over
//     the installed bundle with ditto (preserves the seal, xattrs, symlinks),
//     and relaunch. Node's download carries no quarantine xattr, so the swap
//     never re-triggers Gatekeeper.
//
// `electron` is required lazily inside the runtime entry points so the pure
// decision helpers stay importable by the vitest suite.
const {execFile, spawn} = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");
const {promisify} = require("util");

const execFileP = promisify(execFile);

const DOWNLOAD_BASE = "https://download.domebreak.com";
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

// The stable download URL for a given build, or null when no installer is
// published for that platform/arch (the renderer then falls back to the
// manual website link). Names must match the artifactName templates in
// package.json and the symlinks /ship maintains on the VPS.
function installerUrl(platform, arch) {
    if (platform === "darwin" && ["arm64", "x64"].includes(arch)) {
        return `${DOWNLOAD_BASE}/DomeBreak-mac-${arch}.dmg`;
    }
    if (platform === "win32" && ["x64", "arm64", "ia32"].includes(arch)) {
        return `${DOWNLOAD_BASE}/DomeBreak-win-${arch}.exe`;
    }
    return null;
}

// <bundle>.app/Contents/MacOS/<binary> -> <bundle>.app, or null when the
// executable isn't inside an app bundle (dev runs).
function macBundlePath(execPath) {
    const bundle = path.resolve(execPath, "..", "..", "..");
    return bundle.endsWith(".app") ? bundle : null;
}

// Why an in-place macOS swap cannot proceed, or null when it can. Gatekeeper
// translocation and running straight off the mounted dmg both put the bundle
// somewhere read-only/ephemeral where replacing it is meaningless.
function macInstallBlockReason(bundlePath) {
    if (!bundlePath) return "DomeBreak is not running from an installed app bundle.";
    if (bundlePath.includes("/AppTranslocation/")) {
        return "macOS is running DomeBreak from a temporary location. Move DomeBreak.app to your Applications folder, then update.";
    }
    if (bundlePath.startsWith("/Volumes/")) {
        return "DomeBreak is running from the installer disk image. Drag DomeBreak.app to your Applications folder, then update.";
    }
    return null;
}

// Stream `url` to `dest`, following redirects, reporting fractional progress.
function download(url, dest, onProgress, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > MAX_REDIRECTS) return reject(new Error("Too many redirects fetching the update."));
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const next = new URL(res.headers.location, url).href;
                return resolve(download(next, dest, onProgress, redirects + 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Update download failed (HTTP ${res.statusCode}).`));
            }
            const total = Number(res.headers["content-length"]) || 0;
            let got = 0;
            const out = fs.createWriteStream(dest);
            res.on("data", (chunk) => {
                got += chunk.length;
                if (total) onProgress(got / total);
            });
            res.on("error", reject);
            out.on("error", reject);
            out.on("finish", () => {
                if (total && got !== total) return reject(new Error("Update download was cut short."));
                resolve();
            });
            res.pipe(out);
        });
        req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => req.destroy(new Error("Update download timed out.")));
        req.on("error", reject);
    });
}

async function run(cmd, args) {
    try {
        const {stdout} = await execFileP(cmd, args, {maxBuffer: 8 * 1024 * 1024});
        return stdout;
    } catch (e) {
        const detail = String(e.stderr || e.message || e).trim().split("\n")[0];
        throw new Error(`${cmd} failed: ${detail}`);
    }
}

function updatesDir(app) {
    return path.join(app.getPath("temp"), "DomeBreak-Updates");
}

// Silent NSIS reinstall. --updated tells the installer this is an in-place
// update; --force-run relaunches the app when it finishes. The installer
// waits out / closes the exiting instance itself, so quit right after
// detaching it.
function installWindows(app, exePath) {
    const head = Buffer.alloc(2);
    const fd = fs.openSync(exePath, "r");
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    if (head.toString("latin1") !== "MZ") throw new Error("The downloaded installer is not a Windows executable.");
    spawn(exePath, ["/S", "--updated", "--force-run"], {detached: true, stdio: "ignore"}).unref();
    setTimeout(() => app.quit(), 400);
}

// Mount the dmg, vet the new bundle (valid ad-hoc seal, expected version),
// swap it over the installed bundle, relaunch. The old bundle is renamed
// aside first so a failed copy can roll straight back; leftovers are swept on
// the next boot (cleanupLeftovers).
async function installMac(app, dmgPath, bundle, targetVersion, send) {
    const mnt = fs.mkdtempSync(path.join(updatesDir(app), "mnt-"));
    try {
        await run("hdiutil", ["attach", dmgPath, "-nobrowse", "-noautoopen", "-readonly", "-mountpoint", mnt]);
        try {
            const apps = fs.readdirSync(mnt).filter((f) => f.endsWith(".app"));
            if (apps.length !== 1) throw new Error("The update disk image does not contain a single app.");
            const srcApp = path.join(mnt, apps[0]);
            await run("codesign", ["--verify", "--deep", "--strict", srcApp]);
            const version = (await run("defaults", ["read", path.join(srcApp, "Contents", "Info"), "CFBundleShortVersionString"])).trim();
            if (targetVersion && version !== targetVersion) {
                throw new Error(`The published build is v${version}, expected v${targetVersion}. Try again in a minute.`);
            }
            const aside = path.join(path.dirname(bundle), `.${path.basename(bundle)}.old-${Date.now()}`);
            fs.renameSync(bundle, aside);
            try {
                await run("ditto", [srcApp, bundle]);
            } catch (e) {
                try {
                    fs.renameSync(aside, bundle);
                } catch { /* rollback is best-effort; the aside copy still exists */
                }
                throw e;
            }
            fs.rm(aside, {recursive: true, force: true}, () => {
            });
        } finally {
            await run("hdiutil", ["detach", mnt, "-quiet"]).catch(() => {
            });
        }
    } finally {
        try {
            fs.rmSync(mnt, {recursive: true, force: true});
        } catch { /* detach failed and the volume is still mounted — leave it */
        }
    }
    send("restarting");
    app.relaunch();
    setTimeout(() => app.quit(), 400);
}

// Sweep artifacts a previous update left behind: the download scratch dir,
// and on macOS the renamed-aside old bundle (its binary was still running
// when the update finished, so it is deleted on the boot after).
function cleanupLeftovers(app) {
    try {
        fs.rmSync(updatesDir(app), {recursive: true, force: true});
    } catch { /* a prior installer may still hold its file open — next boot */
    }
    if (process.platform !== "darwin") return;
    const bundle = macBundlePath(process.execPath);
    if (!bundle) return;
    try {
        const dir = path.dirname(bundle);
        const prefix = `.${path.basename(bundle)}.old-`;
        for (const f of fs.readdirSync(dir)) {
            if (!f.startsWith(prefix)) continue;
            try {
                fs.rmSync(path.join(dir, f), {recursive: true, force: true});
            } catch { /* still locked — retry next boot */
            }
        }
    } catch { /* unreadable install dir — nothing to sweep */
    }
}

async function runUpdate(app, targetVersion, send) {
    if (!app.isPackaged) throw new Error("Auto-update only runs in the installed app.");
    const url = installerUrl(process.platform, process.arch);
    if (!url) throw new Error("No published installer for this platform.");

    let bundle = null;
    if (process.platform === "darwin") {
        bundle = macBundlePath(process.execPath);
        const blocked = macInstallBlockReason(bundle);
        if (blocked) throw new Error(blocked);
        try {
            fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
        } catch {
            throw new Error("DomeBreak cannot write to its install folder to update itself.");
        }
    }

    fs.mkdirSync(updatesDir(app), {recursive: true});
    const dest = path.join(updatesDir(app), path.basename(new URL(url).pathname));
    let lastPct = -1;
    send("downloading", 0);
    await download(url, dest, (fraction) => {
        const pct = Math.floor(fraction * 100);
        if (pct !== lastPct) {
            lastPct = pct;
            send("downloading", fraction);
        }
    });
    send("installing");
    if (process.platform === "win32") {
        installWindows(app, dest);
    } else {
        await installMac(app, dest, bundle, targetVersion, send);
    }
}

// IPC surface (preload exposes it as window.dbUpdater): update:start kicks the
// whole flow off and resolves/rejects as its completion signal; update:progress
// events narrate the phases so the overlay can render download percent.
function registerUpdater() {
    const {app, ipcMain} = require("electron");
    cleanupLeftovers(app);
    let updating = false;
    ipcMain.handle("update:start", async (event, targetVersion) => {
        if (updating) return;
        updating = true;
        const send = (phase, percent) => {
            try {
                event.sender.send("update:progress", {phase, ...(percent === undefined ? {} : {percent})});
            } catch { /* window closed mid-update — install proceeds regardless */
            }
        };
        try {
            await runUpdate(app, typeof targetVersion === "string" ? targetVersion : null, send);
        } catch (e) {
            updating = false;
            throw e;
        }
    });
}

module.exports = {installerUrl, macBundlePath, macInstallBlockReason, registerUpdater};
