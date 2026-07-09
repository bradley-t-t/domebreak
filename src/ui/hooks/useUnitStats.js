// Selection-panel stat sheet: research-aware numbers per unit class, as label/value rows
// the detail grid renders directly.
import {
    defenseMinRange,
    defenseRange,
    INTERCEPT_CAP,
    RADAR_RANGE_MULT,
    radarLinked,
    radarRangeOf,
    UNITS
} from "../../game/engine.js";
import {fmtKm as km} from "../lib/format.js";

export function useUnitStats({w, myNation, mySlot, armOf}) {
    return (u) => {
        const def = UNITS[u.type];
        const rows = [];
        if (def.kind === "defense") {
            rows.push(["Intercept", `${Math.round(Math.min(INTERCEPT_CAP, def.intercept + (myNation?.interceptAdd ?? 0)) * 100)}%`]);
            rows.push(["Engage Range", km(defenseRange(w, u))]);
            if (defenseMinRange(w, u) > 0) rows.push(["Min Range", km(defenseMinRange(w, u))]);
            rows.push(["Radar Link", radarLinked(w, u) ? `Linked ×${RADAR_RANGE_MULT}` : "No Link"]);
            rows.push(["Reload", `${def.reload}s`]);
            rows.push(["Shot Cost", `◆ ${def.fireCost}`]);
        }
        if (def.kind === "offense") {
            rows.push(["Damage", `${Math.round(def.damage * (myNation?.dmgMult ?? 1))}`]);
            rows.push(["Strike Range", km(def.range * (myNation?.rangeMult ?? 1))]);
            rows.push(["Reload", `${(def.reload * (myNation?.reloadMult ?? 1)).toFixed(1)}s`]);
            rows.push(["Shot Cost", `◆ ${def.fireCost}`]);
            if (def.speed) rows.push(["Missile Spd", `${def.speed} km/s`]);
        }
        if (def.detect) {
            rows.push(["Detection", km(radarRangeOf(u.type) * (myNation?.radarMult ?? 1))]);
            rows.push(["Track Grade", def.warnOnly ? "Warning Only" : "Fire Control"]);
        } else if (def.radarKm) rows.push(["Radar", km(def.radarKm * (myNation?.radarMult ?? 1))]);
        if (def.kind === "industry") {
            rows.push(["Output", `+${def.output}/s`]);
            rows.push(["GDP", `+$${def.gdpAdd}T`]);
        }
        if (def.navalSpeed) {
            rows.push(["Speed", `${def.navalSpeed} kn`]);
            rows.push(["Status", u.dest ? "Under Way" : "On Station"]);
        }
        if (def.landSpeed) {
            rows.push(["Speed", `${def.landSpeed} km/h`]);
            rows.push(["Status", u.dest ? "On the March" : "Holding"]);
        }
        if (def.airSpeed) rows.push(["Air Speed", `${def.airSpeed} kn`]);
        // Your own warhead platforms surface their loadout through the PAYLOAD picker
        // (the source of truth), so don't also print a fixed one-round "Armament" line
        // that would contradict it. Enemy platforms keep the flavor readout.
        const arm = def.warheads && u.slot === mySlot ? null : armOf(u.type, u.slot);
        if (arm) rows.push(["Armament", arm]);
        rows.push(["Upkeep", `${def.upkeep}/s`]);
        return rows;
    };
}
