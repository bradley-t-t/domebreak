// The online command whitelist (server/match/commands.js): the ONLY surface
// through which a client mutates the authoritative world. Every command must
// (a) exist — a missing entry means the action silently no-ops online (the
// Shelter-Leadership bug), (b) act only for the SENDER'S slot, and (c) sanitize
// its args. Deterministic.
import {describe, expect, it} from "vitest";
import {COMMANDS} from "../../../server/match/commands.js";
import {createWorld} from "../../../src/game/engine.js";

// Every command the online client can actually send: its api, minus ONLY the
// LOCAL_ONLY UI controls (setSpeed/pause/play/dismissWarPopup). Everything else in
// useEngine — diplomacy included — is optimistically applied AND dispatched to the
// server, so each needs a handler here. Keep in sync with src/ui/hooks/useEngine.js:
// a client api that isn't listed (or a whitelist entry that's missing) is the bug
// this guards.
const CLIENT_COMMANDS = [
    "buyPlace", "commandAttack", "move", "setSail", "stopSail", "setFollow", "stopFollow",
    "queueAircraft", "setPatrolSize", "setAwacsPatrol", "declareWar", "scrap",
    "produceAmmo", "cancelProd", "setWarhead", "embark", "disembark", "march",
    "shelterLeadership", "releaseLeadership",
    "offerPeace", "respondPeace", "proposeAlliance", "respondAlliance", "breakAlliance",
];

function w2() {
    const w = createWorld({
        mySlot: 0, seed: 5,
        nations: [
            {slot: 0, name: "A", iso: "USA", isAi: false, gdp: 5},
            {slot: 1, name: "B", iso: "RUS", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "ACap", cap: 1, pop: 100, econ: 1, lng: 0, lat: 0},
            {id: "a2", slot: 0, name: "A2", cap: 0, pop: 50, econ: 1, lng: 1, lat: 0},
            {id: "b1", slot: 1, name: "BCap", cap: 1, pop: 100, econ: 1, lng: 10, lat: 0},
        ],
        rules: {playerGraceSec: 0}, // opening ceasefire off so declareWar tests fire at t=0
    });
    return w;
}
const unit = (o) => ({id: "u", slot: 0, type: "tank", hp: 100, lng: 0, lat: 0, cooldown: 0, ...o});

describe("command whitelist — completeness (the Shelter-Leadership regression guard)", () => {
    it("test_every_client_command_has_a_server_handler", () => {
        const missing = CLIENT_COMMANDS.filter((c) => typeof COMMANDS[c] !== "function");
        expect(missing).toEqual([]);
    });

    it("test_shelter_and_release_leadership_are_whitelisted", () => {
        // The exact bug: these existed on the client but not the server, so online
        // Shelter/Release were rejected as "unknown command".
        expect(typeof COMMANDS.shelterLeadership).toBe("function");
        expect(typeof COMMANDS.releaseLeadership).toBe("function");
    });
});

describe("command routing — acts only for the sender", () => {
    it("test_commandAttack_rejects_a_unit_the_sender_does_not_own", () => {
        const w = w2();
        w.units.push(unit({id: "enemyTank", slot: 1})); // owned by nation 1
        expect(COMMANDS.commandAttack(w, 0, ["enemyTank", null])).toEqual({error: "not your unit"});
    });

    it("test_commandAttack_accepts_the_sender_own_unit", () => {
        const w = w2();
        w.units.push(unit({id: "mine", slot: 0}));
        const r = COMMANDS.commandAttack(w, 0, ["mine", null]);
        expect(r.error).toBeUndefined();
    });

    it("test_declareWar_uses_the_sender_slot", () => {
        const w = w2();
        COMMANDS.declareWar(w, 0, [1]);
        expect(w.nations[0].relations[1]).toBe("war");
        expect(w.nations[1].relations[0]).toBe("war");
    });

    it("test_diplomacy_commands_route_into_the_engine_for_the_sender", () => {
        // These existed on the client but were never whitelisted, so online peace and
        // alliance actions were rejected as "unknown command" — the same regression as
        // Shelter-Leadership. A proposeAlliance from the sender must reach the engine
        // and register under the sender's slot.
        const w = w2();
        w.nations[1].isAi = false; // proposing to a human → deterministic pending offer
        COMMANDS.proposeAlliance(w, 0, [1]);
        expect(w.pendingAlliance.some((o) => o.from === 0 && o.to === 1)).toBe(true);
    });
});

describe("leadership commands (Shelter / Release) route into the engine", () => {
    it("test_shelter_without_infrastructure_returns_the_engine_error", () => {
        const w = w2();
        // Routes to the engine, which refuses without a bunker — proves it is NOT
        // an "unknown command" swallow.
        expect(COMMANDS.shelterLeadership(w, 0)).toEqual({error: "Build a Leadership Bunker first."});
    });

    it("test_shelter_with_bunker_and_airstrip_arms_the_evac", () => {
        const w = w2();
        w.units.push(unit({id: "bk", type: "bunker"}), unit({id: "as", type: "airstrip"}));
        expect(COMMANDS.shelterLeadership(w, 0)).toEqual({ok: true});
        expect(w.nations[0]._evac).toBe("shelter");
    });

    it("test_release_requires_sheltered_leadership", () => {
        const w = w2();
        w.units.push(unit({id: "bk", type: "bunker"}), unit({id: "as", type: "airstrip"}));
        expect(COMMANDS.releaseLeadership(w, 0)).toEqual({error: "No leadership is sheltered."});
    });
});

describe("argument sanitization — malformed args never throw", () => {
    it("test_numeric_and_string_args_are_coerced_or_nulled", () => {
        const w = w2();
        // Non-string ids / non-finite coords must be handled, not crash.
        expect(() => COMMANDS.move(w, 0, [{}, "nope", NaN, "x"])).not.toThrow();
        expect(() => COMMANDS.buyPlace(w, 0, [42, undefined, null])).not.toThrow();
        expect(() => COMMANDS.march(w, 0, [null, Infinity, -Infinity])).not.toThrow();
        expect(() => COMMANDS.setWarhead(w, 0, [123, 456])).not.toThrow();
    });
});
