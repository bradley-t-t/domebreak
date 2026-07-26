// DomeBreak match server. Four jobs:
//   1. Run the matchmaker (server/matchmaker): group waiting quick-match
//      queue rows, form lobbies (real players only), and auto-launch by
//      flipping lobbies to 'starting'.
//   2. Claim lobbies flipped to 'starting' (Realtime + poll fallback), build a
//      Match, and advertise this server's WS URLs back on the lobby row.
//   3. Terminate WebSockets: verify the Supabase JWT, map user -> slot, route
//      whitelisted commands, relay player chat, stream snapshots.
//   4. Record results with the service role when a war ends.
// It also serves the built client from ../dist so any browser on the network
// can play without installing anything.
import http from "http";
import {readFileSync, statSync} from "fs";
import {extname, join, normalize} from "path";
import {WebSocketServer} from "ws";
import {createClient} from "@supabase/supabase-js";
import {APP_VERSION, MAX_MATCHES, PORT, SERVICE_ROLE_KEY, SUPABASE_URL, WS_URLS} from "./config.js";
import {clientAllowed} from "../src/net/version.js";
import {Match} from "./match/match.js";
import {startMatchmaker} from "./matchmaker/matchmaker.js";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const matches = new Map(); // matchId -> Match
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Live matches = those still running (finished ones linger in the map for late
// reconnects but no longer count against capacity).
function liveMatches() {
    return [...matches.values()].filter((m) => !m.reported).length;
}

async function claimLobby(row) {
    if (liveMatches() >= MAX_MATCHES) {
        log("at capacity", liveMatches(), "/", MAX_MATCHES, "- leaving lobby", row.id, "for the next sweep");
        return;
    }
    // status-guarded update = single-claim, even if realtime and the poll race
    const {data: claimed} = await db.from("lobbies")
        .update({status: "active", updated_at: new Date().toISOString()})
        .eq("id", row.id).eq("status", "starting").select().maybeSingle();
    if (!claimed) return;

    // Real players only (no bots): every member has a user_id + profile.
    const {data: members} = await db.from("lobby_members")
        .select("user_id, slot, iso, ready, is_bot, display_name, profiles(username)")
        .eq("lobby_id", row.id).order("slot");
    if (!members?.length) {
        await db.from("lobbies").update({status: "closed"}).eq("id", row.id);
        return;
    }
    const roster = members.map((m) => ({
        userId: m.user_id,
        username: m.display_name || (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username || "Commander",
        iso: m.iso,
        isBot: !!m.is_bot,
        ready: !!m.ready,
    }));

    const match = new Match({
        lobbyId: row.id,
        roster,
        // Shared match rules the lobby authored (may be null on older schemas —
        // Match falls back to defaults).
        rules: row.rules ?? null,
        onFinished: async (m) => {
            const {error} = await db.from("matches").insert(m.resultRows());
            if (error) log("result insert failed", m.id, error.message);
            await db.from("lobbies").update({status: "closed"}).eq("id", m.lobbyId);
            setTimeout(() => {
                m.dispose();
                matches.delete(m.id);
            }, 5 * 60_000); // linger for late "over" screens/reconnects
        },
    });
    matches.set(match.id, match);
    await db.from("lobbies").update({match_id: match.id, server_url: WS_URLS.join(",")}).eq("id", row.id);
    log("match started", match.id, "lobby", row.id, "players", roster.length);
}

async function pollStarting() {
    const {data} = await db.from("lobbies").select("*").eq("status", "starting");
    for (const row of data ?? []) await claimLobby(row);
}

function watchLobbies() {
    db.channel("db-server-lobbies")
        .on("postgres_changes", {event: "UPDATE", schema: "public", table: "lobbies"}, (payload) => {
            if (payload.new?.status === "starting") claimLobby(payload.new);
        })
        .subscribe((status) => log("lobby realtime:", status));
    setInterval(pollStarting, 5000); // belt-and-braces if realtime hiccups
}

// static client + health

const DIST = join(process.cwd(), "dist");
const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".pmtiles": "application/octet-stream", ".geojson": "application/json", ".png": "image/png",
    ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
};

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/health") {
        res.writeHead(200, {"Content-Type": "application/json"});
        return res.end(JSON.stringify({ok: true, version: APP_VERSION, matches: liveMatches(), max: MAX_MATCHES, ws: WS_URLS}));
    }
    let filePath = normalize(join(DIST, urlPath === "/" ? "index.html" : urlPath));
    if (!filePath.startsWith(DIST)) {
        res.writeHead(403);
        return res.end();
    }
    try {
        if (!statSync(filePath).isFile()) throw new Error("dir");
    } catch {
        filePath = join(DIST, "index.html"); // SPA fallback
    }
    try {
        const body = readFileSync(filePath);
        res.writeHead(200, {"Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream"});
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({server, perMessageDeflate: true});

wss.on("connection", (ws) => {
    let match = null, slot = null;
    ws.on("message", async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        if (msg.t === "hello") {
            // Version gate before anything else: an outdated client must never
            // enter a match — the sim it predicts with wouldn't be the sim the
            // server runs. "version" errs carry the required version so the
            // client can render an update prompt instead of a generic failure.
            if (APP_VERSION && !clientAllowed(msg.v, APP_VERSION)) {
                return ws.send(JSON.stringify({t: "err", error: "version", required: APP_VERSION, got: msg.v ?? null}));
            }
            const m = matches.get(msg.matchId);
            if (!m) return ws.send(JSON.stringify({t: "err", error: "no such match"}));
            const {data: {user} = {user: null}} = await db.auth.getUser(typeof msg.jwt === "string" ? msg.jwt : "");
            if (!user) return ws.send(JSON.stringify({t: "err", error: "unauthorized"}));
            const p = m.attach(user.id, ws);
            if (!p) return ws.send(JSON.stringify({t: "err", error: "not in this match"}));
            match = m;
            slot = p.slot;
            ws.send(m.initPayload(slot));
        } else if (msg.t === "cmd" && match && slot != null) {
            const r = match.command(slot, msg.name, msg.args);
            // Ack even on rejection: the client drops its prediction from the pending
            // buffer either way, and the next snapshot carries the authoritative truth.
            match.recordAck(slot, msg.seq);
            if (r?.error && msg.seq != null) ws.send(JSON.stringify({t: "nack", seq: msg.seq, error: r.error}));
        } else if (msg.t === "chat" && match && slot != null) {
            match.chat(slot, msg.text);
        }
    });
    ws.on("close", () => {
        if (match && slot != null) match.detach(slot);
    });
});

watchLobbies();
pollStarting();
startMatchmaker(db, log);
server.listen(PORT, "0.0.0.0", () => log(
    `domebreak server v${APP_VERSION ?? "?"} on :${PORT}, advertising ${WS_URLS.join(", ")}`
    + (APP_VERSION ? ` (clients must match v${APP_VERSION})` : " (no version in package.json — client version gate OFF)"),
));
