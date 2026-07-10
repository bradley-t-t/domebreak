// Match connection: tries the server's advertised WS URLs in order, verifies
// in with the Supabase JWT, then keeps ONE stable world object alive for the
// whole match — snapshots overwrite it in place so the engine hook (and every
// React ref into it) never has to re-seat. Auto-reconnects with fresh JWTs.
const HELLO_TIMEOUT_MS = 4000;
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;
// Rolling player-chat log retained on the client (the server keeps none).
const CHAT_HISTORY = 100;
// Courtesy cap on outgoing chat; the server enforces the same bound (match.js).
const CHAT_MAX_LEN = 240;

// Attach a structured .details string to every error surfaced from this module
// so the client's error overlay can render (and copy) an actionable dump.
// Keeps message short + user-facing; details is the debuggable technical trace.
function tagError(err, details) {
    if (err && typeof err === "object") err.details = details;
    return err;
}
function formatDetails(fields) {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n");
}

// Overwrite the live world with a server snapshot, preserving identity: the same
// world object is kept (so engine refs stay valid) — keys absent from the snapshot
// are dropped, the snapshot's keys are copied over, and mySlot is re-stamped.
// Exported for tests.
export function absorb(target, snapshot, mySlot) {
    for (const k of Object.keys(target)) {
        if (!(k in snapshot)) delete target[k];
    }
    Object.assign(target, snapshot);
    target.mySlot = mySlot;
}

function dial(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        let ws;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            return reject(tagError(new Error(`bad WebSocket URL: ${url}`), formatDetails({url, cause: e?.message || String(e)})));
        }
        const t = setTimeout(() => {
            try { ws.close(); } catch { /* already gone */ }
            reject(tagError(new Error(`connect timeout (${timeoutMs}ms) — ${url}`), formatDetails({url, phase: "dial", timeoutMs})));
        }, timeoutMs);
        ws.onopen = () => {
            clearTimeout(t);
            resolve(ws);
        };
        ws.onerror = () => {
            clearTimeout(t);
            reject(tagError(new Error(`connect failed — ${url}`), formatDetails({url, phase: "dial"})));
        };
    });
}

async function dialAny(urls) {
    if (!urls?.length) {
        throw tagError(new Error("no server URL advertised"), formatDetails({phase: "dial", urls: "[]"}));
    }
    const attempts = [];
    for (const url of urls) {
        try {
            return await dial(url, HELLO_TIMEOUT_MS);
        } catch (e) {
            attempts.push(`  - ${url}: ${e?.message || e}`);
        }
    }
    throw tagError(
        new Error(`no server reachable (${urls.length} URL${urls.length === 1 ? "" : "s"} tried)`),
        formatDetails({phase: "dial", tried: `\n${attempts.join("\n")}`}),
    );
}

// Resolves once the server accepts the hello and sends the initial world.
// getJwt is called on every (re)connect so refreshed tokens are always used.
export function connectMatch({urls, matchId, getJwt, onOver, onClose}) {
    return new Promise((resolve, reject) => {
        const client = {
            world: null,
            slot: null,
            players: [],
            chat: [], // received chat lines [{id, slot, username, text, ts}], oldest first
            connected: false,
            _ws: null,
            _closed: false,
            _forceRender: null, // wired up by useGameSession for instant snapshot renders
            _onChat: null,      // wired up by ChatBox for instant message renders
            send(name, args) {
                if (this._ws?.readyState === WebSocket.OPEN) {
                    this._ws.send(JSON.stringify({t: "cmd", name, args}));
                }
            },
            sendChat(text) {
                const t = String(text ?? "").trim().slice(0, CHAT_MAX_LEN);
                if (!t) return;
                if (this._ws?.readyState === WebSocket.OPEN) {
                    this._ws.send(JSON.stringify({t: "chat", text: t}));
                }
            },
            close() {
                this._closed = true;
                try {
                    this._ws?.close(1000, "leaving");
                } catch { /* already gone */
                }
            },
        };

        let resolved = false;
        let lastCloseInfo = null; // {code, reason} from the most recent ws close
        let chatSeq = 0;          // stable per-message id for React keys, survives reconnects

        const attach = async () => {
            const ws = await dialAny(urls);
            client._ws = ws;
            const jwt = await getJwt();
            if (!jwt) {
                try { ws.close(); } catch { /* gone */ }
                throw tagError(new Error("no auth session"), formatDetails({phase: "hello", matchId, cause: "getJwt() returned an empty token — session expired?"}));
            }
            ws.onmessage = (ev) => {
                let msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch {
                    return;
                }
                if (msg.t === "init") {
                    client.slot = msg.slot;
                    client.players = msg.players || [];
                    if (client.world) absorb(client.world, msg.world, msg.slot);
                    else {
                        client.world = msg.world;
                        client.world.mySlot = msg.slot;
                    }
                    client.connected = true;
                    if (!resolved) {
                        resolved = true;
                        resolve(client);
                    }
                    client._forceRender?.();
                } else if (msg.t === "snap") {
                    if (client.world) absorb(client.world, msg.world, client.slot);
                    client._forceRender?.();
                } else if (msg.t === "chat") {
                    client.chat.push({id: ++chatSeq, slot: msg.slot, username: msg.username, text: String(msg.text ?? ""), ts: msg.ts});
                    if (client.chat.length > CHAT_HISTORY) client.chat.splice(0, client.chat.length - CHAT_HISTORY);
                    client._onChat?.();
                } else if (msg.t === "over") {
                    if (client.world) absorb(client.world, msg.world, client.slot);
                    client._forceRender?.();
                    onOver?.(msg.winnerSlot);
                } else if (msg.t === "err") {
                    if (!resolved) {
                        resolved = true;
                        reject(tagError(
                            new Error(`server rejected: ${msg.error}`),
                            formatDetails({phase: "hello", matchId, url: ws.url, serverError: msg.error}),
                        ));
                    }
                    client._closed = true;
                    try {
                        ws.close();
                    } catch { /* gone */
                    }
                }
            };
            ws.onclose = async (ev) => {
                lastCloseInfo = {code: ev?.code, reason: ev?.reason || ""};
                client.connected = false;
                if (client._closed) return onClose?.("left");
                for (let i = 0; i < RECONNECT_ATTEMPTS && !client._closed; i++) {
                    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
                    try {
                        await attach();
                        return;
                    } catch { /* next attempt */
                    }
                }
                onClose?.("lost", formatDetails({
                    phase: "reconnect",
                    matchId,
                    attempts: RECONNECT_ATTEMPTS,
                    wsCloseCode: lastCloseInfo?.code,
                    wsCloseReason: lastCloseInfo?.reason || undefined,
                }));
            };
            ws.send(JSON.stringify({t: "hello", jwt, matchId}));
        };

        attach().catch((e) => {
            if (!resolved) {
                resolved = true;
                reject(e);
            }
        });
    });
}
