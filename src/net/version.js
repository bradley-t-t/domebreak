// Version compatibility policy, shared by the game client and the match server
// (server/index.js imports this file directly — keep it dependency-free and
// runnable under plain Node).
//
// The server runs the same simulation code the client predicts with
// (server/match imports src/game/engine.js), so ANY version skew between the
// two risks divergent prediction and snapshot shape. Multiplayer therefore
// requires an EXACT version match, not a minimum: the server rejects a hello
// whose version differs from its own, and the client treats that rejection as
// "update required".

// Normalize a version string for comparison: trim, drop a leading "v".
function norm(v) {
    return typeof v === "string" ? v.trim().replace(/^v/, "") : "";
}

// Parse "X.Y.Z" (extra dotted segments tolerated) into a numeric array, or
// null when the string isn't a dotted-numeric version at all.
export function parseVersion(v) {
    const s = norm(v);
    if (!s || !/^\d+(\.\d+)*$/.test(s)) return null;
    return s.split(".").map(Number);
}

// Semver-style compare: negative when a < b, 0 when equal, positive when
// a > b. An unparseable version compares below every parseable one.
export function compareVersions(a, b) {
    const pa = parseVersion(a), pb = parseVersion(b);
    if (!pa && !pb) return 0;
    if (!pa) return -1;
    if (!pb) return 1;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d < 0 ? -1 : 1;
    }
    return 0;
}

// True when the remote (published) version is strictly newer than the local
// build — the client's "an update is available" signal.
export function isUpdateAvailable(local, remote) {
    return compareVersions(remote, local) > 0;
}

// The multiplayer gate: may a client at clientVersion join a server at
// serverVersion? Exact match only (see policy note above).
export function clientAllowed(clientVersion, serverVersion) {
    const c = parseVersion(clientVersion), s = parseVersion(serverVersion);
    if (!c || !s) return false;
    return compareVersions(clientVersion, serverVersion) === 0;
}
