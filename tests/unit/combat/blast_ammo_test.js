// Ground-zero blast (units take proximity-scaled damage around an impact) and the
// per-launcher warhead allow-list (which platform may load which payload, and the
// reverse map that drives the production UI). Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {allowedAmmo, launchersForAmmo, setWarhead} from "../../../src/game/engine.js";
import {resolveHit} from "../../../src/game/sim/combat.js";
import {BLAST, WARHEADS} from "../../../src/game/data/constants.js";

// Minimal world with the fields resolveHit / setWarhead touch.
function miniWorld(cities = [], units = []) {
    return {time: 0, _id: 0, cities, units, effects: [], events: []};
}

// A standard-warhead projectile aimed at city "c" sitting at ground zero (0,0).
function proj(over = {}) {
    return {warhead: "standard", targetId: "c", damage: 50, slot: 0, toLng: 0, toLat: 0, ...over};
}

const gzCity = () => ({id: "c", slot: 1, hp: 100, maxHp: 100, alive: true, lng: 0, lat: 0});
// ~1° latitude ≈ 111 km, so lat offsets convert cleanly to distance from ground zero.
const unit = (id, lat, hp = 100) => ({id, slot: 1, type: "tank", hp, cooldown: 0, targetId: null, lng: 0, lat});

describe("ground-zero blast", () => {
    it("test_unit_inside_blast_radius_takes_damage", () => {
        // standard blastKm = 70; a unit ~33 km out (0.3°) is well inside.
        const near = unit("near", 0.3);
        const w = miniWorld([gzCity()], [near]);
        resolveHit(w, proj());
        expect(near.hp).toBeLessThan(100);
    });

    it("test_unit_beyond_blast_radius_is_untouched", () => {
        // ~222 km out (2°) is beyond the 70 km standard blast.
        const far = unit("far", 2);
        const w = miniWorld([gzCity()], [far]);
        resolveHit(w, proj());
        expect(far.hp).toBe(100);
    });

    it("test_closer_unit_takes_more_than_a_farther_one", () => {
        const a = unit("a", 0.2), b = unit("b", 0.5); // ~22 km vs ~55 km, both inside 70
        const w = miniWorld([gzCity()], [a, b]);
        resolveHit(w, proj());
        expect(a.hp).toBeLessThan(b.hp);
        expect(b.hp).toBeLessThan(100);
    });

    it("test_direct_target_city_takes_only_its_hit_no_blast", () => {
        // Cities are exempt from blast, so the target city loses exactly p.damage.
        const city = gzCity();
        const w = miniWorld([city], []);
        resolveHit(w, proj({damage: 40}));
        expect(city.hp).toBe(60);
    });

    it("test_cluster_bus_deals_no_extra_blast", () => {
        // Cluster's area comes from the MIRV pattern (blastKm 0), not a bus blast.
        const near = unit("near", 0.3);
        const w = miniWorld([gzCity()], [near]);
        resolveHit(w, proj({warhead: "cluster"}));
        expect(near.hp).toBe(100);
    });

    it("test_blast_kill_emits_a_unit_destroy_event", () => {
        const weak = unit("weak", 0.05, 5); // right at ground zero, almost dead
        const w = miniWorld([gzCity()], [weak]);
        resolveHit(w, proj());
        expect(weak.hp).toBe(0);
        expect(w.events.some((e) => e.type === "destroy" && e.kind === "unit" && e.cityId === "weak")).toBe(true);
    });

    it("test_blast_peak_scales_with_warhead_yield", () => {
        // A thermo core dose (dmgMult 2.4, blastKm 170) far exceeds a standard one.
        const std = unit("s", 0.1), thr = unit("t", 0.1);
        const ws = miniWorld([gzCity()], [std]);
        resolveHit(ws, proj({warhead: "standard", damage: 50}));
        const wt = miniWorld([gzCity()], [thr]);
        resolveHit(wt, proj({warhead: "thermo", damage: 50 * WARHEADS.thermo.dmgMult}));
        expect(100 - thr.hp).toBeGreaterThan(100 - std.hp);
        // Peak dose sanity: standard core ≈ damage × aoeShare.
        expect(100 - std.hp).toBeGreaterThan(50 * BLAST.aoeShare * BLAST.edgeFrac);
    });
});

describe("per-launcher warhead allow-list", () => {
    it("test_launcher_carries_only_sicbm", () => {
        expect(allowedAmmo("launcher")).toEqual(["sicbm"]);
        expect(allowedAmmo("launcher")).not.toContain("thermo");
    });
    it("test_silo_carries_thermo_not_hgv", () => {
        expect(allowedAmmo("silo")).toContain("thermo");
        expect(allowedAmmo("silo")).not.toContain("hgv");
    });
    it("test_hgv_reverse_map_is_the_hypersonic_battery", () => {
        expect(launchersForAmmo("hgv")).toEqual(["hypersonicbty"]);
    });
    it("test_thermo_reverse_map_is_the_strategic_platforms", () => {
        expect(launchersForAmmo("thermo")).toEqual(["silo", "orbitalstrike", "sub-ssbn"]);
    });
    it("test_standard_reverse_map_is_the_icbm_platforms", () => {
        expect(launchersForAmmo("standard")).toEqual(["silo", "sub-ssbn"]);
    });
});

describe("setWarhead honours the allow-list", () => {
    it("test_rejects_a_payload_the_launcher_cannot_carry", () => {
        const u = {id: "L", slot: 0, type: "launcher", warhead: "standard"};
        const w = miniWorld([], [u]);
        expect(setWarhead(w, 0, "L", "thermo").error).toBeTruthy();
        expect(u.warhead).toBe("standard"); // unchanged
    });
    it("test_accepts_a_payload_on_the_allow_list", () => {
        const u = {id: "S", slot: 0, type: "silo", warhead: "standard"};
        const w = miniWorld([], [u]);
        expect(setWarhead(w, 0, "S", "thermo")).toEqual({ok: true});
        expect(u.warhead).toBe("thermo");
    });
});
