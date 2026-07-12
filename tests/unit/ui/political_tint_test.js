// The political map tint shared by the live map (useMapVisualEffects) and the
// menu attract sim (AttractSim). Both must paint nations identically: only active
// belligerents wear their flag color, wiped-out nations take the scorched wash,
// and every other country falls to neutral scenery grey. These assertions lock
// that contract so the two callers can't silently drift apart again.
import {describe, expect, it} from "vitest";
import {
    buildPoliticalTint,
    flagColor,
    NEUTRAL_LINE,
    NEUTRAL_TINT,
    WIPEOUT_LINE,
    WIPEOUT_TINT,
} from "../../../src/ui/lib/politicalTint.js";

// A GID_0 -> [r,g,b] table like the bundled colors.json (three sample nations).
const COLS = {
    USA: [40, 90, 200],
    RUS: [200, 60, 60],
    FRA: [30, 160, 90],
};

// Pull the "match" pairs out of a MapLibre ["match", ["get","GID_0"], k,v,..., default]
// expression into a lookup, plus the trailing default.
function matchToMap(expr) {
    if (!Array.isArray(expr)) return {map: {}, dflt: expr};
    const body = expr.slice(2);
    const dflt = body[body.length - 1];
    const map = {};
    for (let i = 0; i + 1 < body.length - 1; i += 2) map[body[i]] = body[i + 1];
    return {map, dflt};
}

describe("politicalTint", () => {
    it("test_only_active_nations_wear_their_flag_color", () => {
        const {tint} = buildPoliticalTint(COLS, {activeGids: new Set(["USA", "RUS"])});
        const {map, dflt} = matchToMap(tint);
        expect(map.USA).toBe("rgb(40,90,200)");
        expect(map.RUS).toBe("rgb(200,60,60)");
        expect(map.FRA).toBeUndefined();   // not active -> falls to the default
        expect(dflt).toBe(NEUTRAL_TINT);
    });

    it("test_wiped_out_nations_take_the_scorched_wash_over_their_flag", () => {
        const {tint, line} = buildPoliticalTint(COLS, {
            activeGids: new Set(["USA", "RUS"]),
            wipedGids: new Set(["RUS"]),
        });
        const t = matchToMap(tint).map;
        const l = matchToMap(line).map;
        expect(t.USA).toBe("rgb(40,90,200)"); // still fighting -> flag color
        expect(t.RUS).toBe(WIPEOUT_TINT);      // routed -> scorched wash, not its red flag
        expect(l.RUS).toBe(WIPEOUT_LINE);
    });

    it("test_all_active_world_keeps_every_flag_color", () => {
        // No active set -> a full-world roster; every country keeps its flag hue.
        const {tint} = buildPoliticalTint(COLS, {});
        const {map} = matchToMap(tint);
        expect(map.USA).toBe("rgb(40,90,200)");
        expect(map.RUS).toBe("rgb(200,60,60)");
        expect(map.FRA).toBe("rgb(30,160,90)");
    });

    it("test_borders_blend_toward_neutral_grey", () => {
        // line = mix(flag, neutral) at 0.6/0.4 — never the raw flag color.
        const {line} = buildPoliticalTint(COLS, {activeGids: new Set(["USA"])});
        const {map, dflt} = matchToMap(line);
        // USA blue [40,90,200] mixed toward [96,100,108]: round(v*0.6 + g*0.4).
        expect(map.USA).toBe("rgb(62,94,163)");
        expect(dflt).toBe(NEUTRAL_LINE);
    });

    it("test_flagColor_resolves_a_table_entry_and_reports_gaps", () => {
        expect(flagColor(COLS, "USA")).toBe("rgb(40,90,200)");
        expect(flagColor(COLS, "ZZZ")).toBeNull(); // missing -> caller uses its fallback
        expect(flagColor(COLS, null)).toBeNull();
    });
});
