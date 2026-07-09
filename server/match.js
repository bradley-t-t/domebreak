// One live match: builds the world from a lobby roster, ticks it, routes
// validated commands, broadcasts snapshots, and records results when the war
// ends. Humans who drop get a reconnect grace window, then their nation goes
// to the AI; a permanent drop is recorded as a quit.
import {randomUUID} from "crypto";
import {createWorld, step} from "../src/game/engine.js";
import {buildSetup, GREAT_POWERS} from "../src/game/sim/newGame.js";
import {gameData} from "./data.js";
import {COMMANDS} from "./commands.js";
import {openingFreeze} from "./matchStart.js";
import {ABANDON_GRACE_S, MATCH_START_PAUSE_S, RECONNECT_GRACE_S, SNAPSHOT_MS, TICK_MS} from "./config.js";
import {indexBy} from "../src/lib/iter.js";

// Roster isos must be valid (city data exists) and unique — substitutions come
// from the great-powers pool so a bad pick never shifts slot assignments.
function resolveIsos(picks) {
    const data = gameData();
    const used = new Set();
    const out = [];
    for (const want of picks) {
        let iso = typeof want === "string" ? want.toUpperCase() : "";
        if (!data.cities[iso]?.length || used.has(iso)) {
            iso = GREAT_POWERS.find((g) => data.cities[g]?.length && !used.has(g));
        }
        used.add(iso);
        out.push(iso);
    }
    return out;
}

export class Match {
    // roster: [{userId, username, iso, ready}] — REAL PLAYERS ONLY (no bots). The
    // match is the FULL living world (every country is world AI, as in single
    // player); each player claims their own nation within it. A player's slot is
    // that nation's slot in the full world (by GDP order), NOT the roster index —
    // so two players can be arbitrarily far apart on the map.
    constructor({lobbyId, roster, onFinished}) {
        this.id = randomUUID();
        this.lobbyId = lobbyId;
        this.onFinished = onFinished;
        this.startedAt = new Date().toISOString();
        this.sockets = new Map();   // slot -> ws
        this.graceTimers = new Map();
        this.quit = new Set();      // userIds recorded as quit
        this.reported = false;
        this.abandonTimer = null;   // reaps the match if no human is ever present

        // Unique, valid nation per player (bad/duplicate picks resolve to a free
        // great power), then build the full world seeded on the first player.
        const isos = resolveIsos(roster.map((r) => r.iso));
        const setup = buildSetup(gameData(), isos[0], null, (Math.random() * 1e9) | 0 || 1);
        const slotOfIso = indexBy(setup.nations, (n) => n.iso, (n) => n.slot);
        this.players = roster.map((r, i) => ({...r, iso: isos[i], slot: slotOfIso.get(isos[i])}));

        // Hand each player their nation; a human who never readied (force-launched)
        // stays AI until they connect (attach flips isAi=false). Every other nation
        // in the world stays AI.
        const bySlot = indexBy(this.players, (p) => p.slot);
        setup.nations.forEach((n) => {
            const p = bySlot.get(n.slot);
            n.isAi = p ? (p.ready === false) : true;
        });
        this.world = createWorld(setup);
        // Online speed is permanently locked to 1x: no speed/pause command exists
        // in the whitelist (COMMANDS) and clients can't send one, so nothing ever
        // mutates it. The match opens on a fixed pause so everyone loads in first.
        this.world.speed = 1;
        this.startPauseUntil = Date.now() + MATCH_START_PAUSE_S * 1000;
        const freeze = openingFreeze(Date.now(), this.startPauseUntil);
        this.world.paused = freeze.paused;
        this.world.startsIn = freeze.startsIn; // whole-second countdown shown to players; 0 = live
        this.world.meta = {matchId: this.id, mode: "online"};

        let last = Date.now();
        this.tickTimer = setInterval(() => {
            const now = Date.now();
            const dt = Math.min(0.25, (now - last) / 1000);
            last = now;
            if (this.world.paused) {
                // Opening freeze: hold the sim and count down, then release to live
                // play. Once released, this branch never runs again (nothing can
                // re-pause an online match).
                const state = openingFreeze(now, this.startPauseUntil);
                this.world.paused = state.paused;
                this.world.startsIn = state.startsIn;
                if (state.paused) return;
            }
            if (!this.world.over) step(this.world, dt * this.world.speed);
            if (this.world.over) this.finish();
        }, TICK_MS);
        this.snapTimer = setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS);
        // A fresh match has no sockets yet: arm the reaper so a client that never
        // dials in can't strand this slot. attach() disarms it the moment a human
        // connects; detach() re-arms it when the last human leaves.
        this.armAbandon();
    }

    // Free this match's capacity slot when no human is connected. A quick-match
    // always seats at least one human; if they never connect, or every human
    // drops and none returns within ABANDON_GRACE_S, the match is ticking for
    // nobody — end it so its MAX_MATCHES slot is released. Headless AI-vs-AI
    // games that never reach a win condition are exactly what jam the server.
    armAbandon() {
        if (this.reported || this.abandonTimer) return;
        this.abandonTimer = setTimeout(() => {
            this.abandonTimer = null;
            if (this.reported || this.sockets.size > 0) return;
            for (const p of this.players) if (p.userId && !p.isBot) this.quit.add(p.userId);
            this.finish(); // records humans as quit, closes the lobby, frees the slot
        }, ABANDON_GRACE_S * 1000);
    }

    disarmAbandon() {
        if (this.abandonTimer) {
            clearTimeout(this.abandonTimer);
            this.abandonTimer = null;
        }
    }

    // Bots have userId === null and never call attach(); only human rows are
    // ever looked up here (WebSocket auth always resolves to a real user_id).
    playerByUser(userId) {
        return this.players.find((p) => p.userId === userId);
    }

    attach(userId, ws) {
        const p = this.playerByUser(userId);
        if (!p) return null;
        const old = this.sockets.get(p.slot);
        if (old && old !== ws) {
            try {
                old.close(4000, "superseded");
            } catch { /* already gone */
            }
        }
        clearTimeout(this.graceTimers.get(p.slot));
        this.graceTimers.delete(p.slot);
        const nation = this.world.nations.find((n) => n.slot === p.slot);
        if (nation) nation.isAi = false; // back from AI stewardship on reconnect
        this.quit.delete(userId);
        this.sockets.set(p.slot, ws);
        this.disarmAbandon(); // a human is present — cancel any pending reap
        return p;
    }

    detach(slot) {
        this.sockets.delete(slot);
        if (this.sockets.size === 0) this.armAbandon(); // last human gone — arm the reaper
        if (this.world.over) return;
        // grace window, then the AI takes the chair and the drop counts as a quit
        this.graceTimers.set(slot, setTimeout(() => {
            const nation = this.world.nations.find((n) => n.slot === slot);
            if (nation) nation.isAi = true;
            const p = this.players.find((x) => x.slot === slot);
            if (p) this.quit.add(p.userId);
        }, RECONNECT_GRACE_S * 1000));
    }

    command(slot, name, args) {
        const fn = COMMANDS[name];
        if (!fn) return {error: "unknown command"};
        if (this.world.over) return {error: "the war is over"};
        try {
            return fn(this.world, slot, Array.isArray(args) ? args : []) ?? {ok: true};
        } catch (e) {
            return {error: String(e?.message || e)};
        }
    }

    broadcastSnapshot() {
        const payload = JSON.stringify({t: "snap", world: this.world});
        for (const ws of this.sockets.values()) {
            if (ws.readyState === ws.OPEN) ws.send(payload);
        }
    }

    initPayload(slot) {
        return JSON.stringify({
            t: "init",
            matchId: this.id,
            slot,
            world: this.world,
            players: this.players.map((p) => ({slot: p.slot, username: p.username, iso: p.iso, isBot: !!p.isBot})),
        });
    }

    finish() {
        if (this.reported) return;
        this.reported = true;
        this.disarmAbandon();
        clearInterval(this.tickTimer);
        clearInterval(this.snapTimer);
        for (const t of this.graceTimers.values()) clearTimeout(t);
        const payload = JSON.stringify({t: "over", winnerSlot: this.world.winnerSlot, world: this.world});
        for (const ws of this.sockets.values()) {
            if (ws.readyState === ws.OPEN) ws.send(payload);
        }
        this.onFinished?.(this);
    }

    // Rows for the matches table — the server is the authority on results.
    // Bots (userId === null) never get a matches row; only humans do.
    resultRows() {
        return this.players.filter((p) => p.userId != null).map((p) => ({
            user_id: p.userId,
            started_at: this.startedAt,
            result: this.quit.has(p.userId) ? "quit" : this.world.winnerSlot === p.slot ? "win" : "loss",
            nation_iso: p.iso,
            opponents: this.players.length - 1, // real-player opponents (the rest of the world is AI)
            duration_s: Math.round(this.world.time),
            mode: "online",
            match_id: this.id,
            stats: {},
        }));
    }

    dispose() {
        this.disarmAbandon();
        clearInterval(this.tickTimer);
        clearInterval(this.snapTimer);
        for (const t of this.graceTimers.values()) clearTimeout(t);
        for (const ws of this.sockets.values()) {
            try {
                ws.close(1001, "match disposed");
            } catch { /* already gone */
            }
        }
    }
}
