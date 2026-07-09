// Render + logic smoke for the two new HUD surfaces (left NationPanel, top
// NewsTicker). Node-env: NationPanel renders via react-dom/server (it has no
// effects, so a static render exercises the whole component), and the ticker's
// pure headline() mapping is asserted directly for every newsworthy event type.
import {describe, expect, it} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createWorld} from "../../../src/game/engine.js";
import NationPanel from "../../../src/ui/hud/NationPanel.jsx";
import {headline} from "../../../src/ui/hud/newsHeadline.js";

// A two-nation world; slot 0 is the player with four cities spanning every
// status band, plus two factories so industry count is non-zero.
function makeWorld() {
    const w = createWorld({
        mySlot: 0,
        seed: 1,
        nations: [
            {slot: 0, iso: "us", name: "United States"},
            {slot: 1, iso: "ru", name: "Russia"},
        ],
        cities: [
            {id: "us-0", slot: 0, name: "Capital City", state: "DC", cap: true, pop: 5e6, econ: 0.3, lng: -77, lat: 38},
            {id: "us-1", slot: 0, name: "Strained Town", state: "NY", cap: false, pop: 8e6, econ: 0.4, lng: -74, lat: 40},
            {id: "us-2", slot: 0, name: "Critical Burg", state: "CA", cap: false, pop: 4e6, econ: 0.2, lng: -118, lat: 34},
            {id: "us-3", slot: 0, name: "Lost Haven", state: "TX", cap: false, pop: 2e6, econ: 0.1, lng: -95, lat: 29},
            {id: "ru-0", slot: 1, name: "Moscow", state: "", cap: true, pop: 12e6, econ: 0.5, lng: 37, lat: 55},
        ],
    });
    const c = (id) => w.cities.find((x) => x.id === id);
    c("us-1").hp = c("us-1").maxHp * 0.6;   // Strained (0.5..0.85)
    c("us-2").hp = c("us-2").maxHp * 0.2;   // Critical (<0.5)
    c("us-3").hp = 0;
    c("us-3").alive = false;                 // Lost
    w.units.push({id: "u1", slot: 0, type: "factory", hp: 10, lng: -77, lat: 38});
    w.units.push({id: "u2", slot: 0, type: "factory", hp: 10, lng: -74, lat: 40});
    return w;
}

describe("NationPanel", () => {
    it("test_renders_nation_header_and_stats", () => {
        const w = makeWorld();
        const html = renderToStaticMarkup(
            React.createElement(NationPanel, {world: w, mySlot: 0, myNation: w.nations[0]})
        );
        expect(html).toContain("United States");
        expect(html).toContain("Industry");
        expect(html).toContain("Territories");
    });

    it("test_shows_every_status_band_and_territory_names", () => {
        const w = makeWorld();
        const html = renderToStaticMarkup(
            React.createElement(NationPanel, {world: w, mySlot: 0, myNation: w.nations[0]})
        );
        expect(html).toContain("Secure");    // full-hp capital
        expect(html).toContain("Strained");
        expect(html).toContain("Critical");
        expect(html).toContain("Lost");      // dead city
        expect(html).toContain("Capital City");
        expect(html).toContain("Lost Haven");
        expect(html).toContain("★");         // capital marker
    });

    it("test_industry_count_reflects_built_factories", () => {
        const w = makeWorld();
        const html = renderToStaticMarkup(
            React.createElement(NationPanel, {world: w, mySlot: 0, myNation: w.nations[0]})
        );
        expect(html).toContain("2");          // two factories standing
        expect(html).toContain("/s");         // industry output readout
    });

    it("test_null_nation_renders_nothing", () => {
        const w = makeWorld();
        const html = renderToStaticMarkup(
            React.createElement(NationPanel, {world: w, mySlot: 0, myNation: null})
        );
        expect(html).toBe("");
    });
});

describe("NewsTicker headline mapping", () => {
    const w = makeWorld();

    it("test_city_nuke_is_danger", () => {
        const h = headline({type: "destroy", kind: "city", cityId: "ru-0"}, w, 0);
        expect(h.tone).toBe("danger");
        expect(h.text).toContain("Moscow");
    });

    it("test_own_city_loss_is_phrased_as_lost", () => {
        const h = headline({type: "destroy", kind: "city", cityId: "us-0"}, w, 0);
        expect(h.tone).toBe("danger");
        expect(h.text).toMatch(/lost/i);
    });

    it("test_unit_kill_is_alert", () => {
        const h = headline({type: "destroy", kind: "unit", slot: 0}, w, 0);
        expect(h.tone).toBe("alert");
        expect(h.text).toContain("United States");
    });

    it("test_construction_uses_unit_label", () => {
        const h = headline({type: "built", kind: "unit", slot: 1, unit: "battery"}, w, 0);
        expect(h.text).toContain("SAM Battery");
        expect(h.tone).toBe("info");
    });

    it("test_own_construction_is_good", () => {
        const h = headline({type: "built", kind: "unit", slot: 0, unit: "battery"}, w, 0);
        expect(h.tone).toBe("good");
    });

    it("test_ammo_build_is_ignored", () => {
        expect(headline({type: "built", kind: "ammo", slot: 0, unit: "x"}, w, 0)).toBeNull();
    });

    it("test_war_and_peace", () => {
        expect(headline({type: "war", a: 0, b: 1}, w, 0).tone).toBe("danger");
        expect(headline({type: "peace", a: 0, b: 1}, w, 0).tone).toBe("good");
    });

    it("test_inbound_launch_only_when_targeting_player", () => {
        expect(headline({type: "launch", slot: 1, tgtSlot: 0, seen: [0]}, w, 0).tone).toBe("danger");
        expect(headline({type: "launch", slot: 1, tgtSlot: 1, seen: [1]}, w, 0)).toBeNull();
    });
});
