// Game installer downloads + OS detection.
//
// Installers are published as GitHub Releases on the public distribution repo
// (the game repo itself is private). The release pipeline builds macOS + Windows
// installers on every release to main and uploads them under stable asset names,
// so the `latest/download` URLs below always serve the current build with no
// site rebuild. Version/size come from the public Releases API at runtime.

const DIST_REPO = "bradley-t-t/domebreak-dist";
export const RELEASES_API = `https://api.github.com/repos/${DIST_REPO}/releases/latest`;
const LATEST_BASE = `https://github.com/${DIST_REPO}/releases/latest/download`;

export const PLATFORMS = {
    mac: {key: "mac", label: "macOS", asset: "DomeBreak-mac.dmg", ext: "DMG", note: "Apple silicon · macOS 11+"},
    win: {key: "win", label: "Windows", asset: "DomeBreak-win.exe", ext: "EXE", note: "64-bit · Windows 10/11"},
};

export function downloadUrl(osKey) {
    const p = PLATFORMS[osKey];
    return p ? `${LATEST_BASE}/${p.asset}` : null;
}

// Best-effort desktop OS detection. The game is desktop-only, so anything not
// clearly Windows or Mac falls back to "other" (we show both installers).
export function detectOS() {
    if (typeof navigator === "undefined") return "other";
    const ua = (navigator.userAgent || "").toLowerCase();
    const plat = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "").toLowerCase();
    const hay = `${plat} ${ua}`;
    if (hay.includes("win")) return "win";
    if (hay.includes("mac")) return "mac";
    return "other";
}

export function formatBytes(n) {
    if (!n || n <= 0) return "";
    const mb = n / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// Returns {version, publishedAt, sizes:{mac,win}} or null. Never throws.
export async function fetchLatestRelease() {
    try {
        const res = await fetch(RELEASES_API, {headers: {Accept: "application/vnd.github+json"}});
        if (!res.ok) return null;
        const d = await res.json();
        const sizes = {};
        for (const a of d.assets || []) {
            if (a.name === PLATFORMS.mac.asset) sizes.mac = a.size;
            if (a.name === PLATFORMS.win.asset) sizes.win = a.size;
        }
        return {version: (d.tag_name || "").replace(/^v/, ""), publishedAt: d.published_at, sizes};
    } catch {
        return null;
    }
}
