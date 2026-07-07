const {app, BrowserWindow, shell, ipcMain} = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Name the app before it's ready so the menu bar / About panel read "DomeBreak"
// instead of the Electron default in dev. The packaged bundle already carries
// the name via electron-builder's productName (its Dock/taskbar label is the
// bundle name — a dev run shows "Electron" because it's the generic binary).
app.setName("DomeBreak");

const DIST = path.join(__dirname, "..", "dist");
// App logo (leadership-bunker mark). Bundled under electron/ so it resolves in
// dev and in the packaged app. Drives the window/taskbar icon on Windows/Linux;
// on macOS the packaged Dock uses the .icns generated from build/icon.png, so we
// only set the Dock icon here to fix the generic-Electron icon during dev runs.
const ICON = path.join(__dirname, "icon.png");

// Machine-local data folder: auth session + mirrored saves/settings live here
// as one JSON file per key (key is URI-encoded to stay filename-safe).
const DATA_DIR = path.join(app.getPath("userData"), "GameData");
const keyFile = (key) => path.join(DATA_DIR, encodeURIComponent(key) + ".json");

function registerLocalStore() {
    // Owner-only: the folder holds the auth session token alongside saves.
    fs.mkdirSync(DATA_DIR, {recursive: true, mode: 0o700});
    ipcMain.handle("db:list", () => {
        const out = {};
        for (const f of fs.readdirSync(DATA_DIR)) {
            if (!f.endsWith(".json")) continue;
            try {
                out[decodeURIComponent(f.slice(0, -5))] = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
            } catch { /* unreadable entry — skip */
            }
        }
        return out;
    });
    ipcMain.handle("db:set", (_e, key, value) => {
        fs.writeFileSync(keyFile(key), String(value), {mode: 0o600});
    });
    ipcMain.handle("db:del", (_e, key) => {
        fs.rmSync(keyFile(key), {force: true});
    });
    ipcMain.handle("db:dir", () => DATA_DIR);
}

const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".pmtiles": "application/octet-stream",
    ".geojson": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
};

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
            if (urlPath === "/") urlPath = "/index.html";
            let filePath = path.normalize(path.join(DIST, urlPath));
            if (!filePath.startsWith(DIST)) {
                res.writeHead(403);
                return res.end();
            }
            fs.stat(filePath, (err, stat) => {
                if (err || !stat.isFile()) {
                    filePath = path.join(DIST, "index.html");
                }
                fs.stat(filePath, (e2, s2) => {
                    if (e2) {
                        res.writeHead(404);
                        return res.end();
                    }
                    const ext = path.extname(filePath).toLowerCase();
                    const type = MIME[ext] || "application/octet-stream";
                    const range = req.headers.range;
                    if (range) {
                        const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
                        let start = m[1] ? parseInt(m[1], 10) : 0;
                        let end = m[2] ? parseInt(m[2], 10) : s2.size - 1;
                        if (isNaN(start)) start = 0;
                        if (isNaN(end) || end >= s2.size) end = s2.size - 1;
                        res.writeHead(206, {
                            "Content-Type": type, "Accept-Ranges": "bytes",
                            "Content-Range": `bytes ${start}-${end}/${s2.size}`,
                            "Content-Length": end - start + 1,
                        });
                        fs.createReadStream(filePath, {start, end}).pipe(res);
                    } else {
                        res.writeHead(200, {"Content-Type": type, "Content-Length": s2.size, "Accept-Ranges": "bytes"});
                        fs.createReadStream(filePath).pipe(res);
                    }
                });
            });
        });
        server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
}

async function createWindow() {
    const port = await startServer();
    const win = new BrowserWindow({
        width: 1440, height: 920, minWidth: 1024, minHeight: 680,
        icon: ICON,
        backgroundColor: "#05080f", title: "DomeBreak",
        titleBarStyle: "hidden",
        trafficLightPosition: {x: 14, y: 18},
        titleBarOverlay: {color: "#05080f", symbolColor: "#9ba1ab", height: 34},
        webPreferences: {
            contextIsolation: true, preload: path.join(__dirname, "preload.cjs"),
            devTools: false, spellcheck: false, backgroundThrottling: false,
        },
    });
    win.setMenuBarVisibility(false);
    // Native-app hardening: nothing that reveals a web runtime. No browser
    // context menu, no pinch/keyboard zoom, no reload or devtools shortcuts.
    // Game keys (WASD/arrows/space/etc.) are untouched.
    win.webContents.on("context-menu", (e) => e.preventDefault());
    win.webContents.setVisualZoomLevelLimits(1, 1);
    win.webContents.on("before-input-event", (e, input) => {
        const mod = input.control || input.meta;
        const k = (input.key || "").toLowerCase();
        const blocked =
            (mod && ["r", "=", "-", "+", "0"].includes(k)) ||
            k === "f5" || k === "f12" ||
            (mod && input.shift && k === "i") ||
            (input.meta && input.alt && k === "i");
        if (blocked) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"};
    });
    win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
    // Dev runs launch the generic Electron binary, so the Dock shows its default
    // icon — set ours. The packaged .app already carries the bunker .icns.
    if (process.platform === "darwin" && !app.isPackaged && app.dock) {
        try {
            app.dock.setIcon(ICON);
        } catch { /* non-fatal — dock icon is cosmetic */
        }
    }
    registerLocalStore();
    createWindow();
});
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
