// Match connection: tries the server's advertised WS URLs in order, verifies
// in with the Supabase JWT, then keeps ONE stable world object alive for the
// whole match — snapshots overwrite it in place so the engine hook (and every
// React ref into it) never has to re-seat. Auto-reconnects with fresh JWTs.
const HELLO_TIMEOUT_MS = 4000;
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

// Overwrite the live world with a server snapshot, preserving identity.
function absorb(target, snapshot, mySlot) {
    for (const k of Object.keys(target)) {
        if (!(k in snapshot)) delete target[k];
    }
    Object.assign(target, snapshot);
    target.mySlot = mySlot;
}

function dial(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const t = setTimeout(() => {
            ws.close();
            reject(new Error("timeout"));
        }, timeoutMs);
        ws.onopen = () => {
            clearTimeout(t);
            resolve(ws);
        };
        ws.onerror = () => {
            clearTimeout(t);
            reject(new Error("connect failed"));
        };
    });
}

async function dialAny(urls) {
    let last = null;
    for (const url of urls) {
        try {
            return await dial(url, HELLO_TIMEOUT_MS);
        } catch (e) {
            last = e;
        }
    }
    throw last || new Error("no server reachable");
}

// Resolves once the server accepts the hello and sends the initial world.
// getJwt is called on every (re)connect so refreshed tokens are always used.
export function connectMatch({urls, matchId, getJwt, onOver, onClose}) {
    return new Promise((resolve, reject) => {
        const client = {
            world: null,
            slot: null,
            players: [],
            connected: false,
            _ws: null,
            _closed: false,
            _forceRender: null, // wired up by useGameSession for instant snapshot renders
            send(name, args) {
                if (this._ws?.readyState === WebSocket.OPEN) {
                    this._ws.send(JSON.stringify({t: "cmd", name, args}));
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

        const attach = async () => {
            const ws = await dialAny(urls);
            client._ws = ws;
            const jwt = await getJwt();
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
                } else if (msg.t === "over") {
                    if (client.world) absorb(client.world, msg.world, client.slot);
                    client._forceRender?.();
                    onOver?.(msg.winnerSlot);
                } else if (msg.t === "err") {
                    if (!resolved) {
                        resolved = true;
                        reject(new Error(msg.error));
                    }
                    client._closed = true;
                    try {
                        ws.close();
                    } catch { /* gone */
                    }
                }
            };
            ws.onclose = async () => {
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
                onClose?.("lost");
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
