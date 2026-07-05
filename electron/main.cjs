const {app, BrowserWindow, shell} = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");
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
        backgroundColor: "#05080f", title: "GoldenDome",
        webPreferences: {contextIsolation: true},
    });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"};
    });
    win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
