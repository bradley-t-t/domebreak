// The two on-map hover readouts — the zoomed-out whole-country tooltip and the
// zoomed-in city/unit tooltip — fed by LiveGame's hover probe (onMove) and
// its pre-filtered hoverEnt lookup.
import Flag from "../common/Flag.jsx";
import Meter from "../common/Meter.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import HoverReadout from "./HoverReadout.jsx";
import {fmtPop} from "../lib/format.js";
import {toGid3} from "../../game/data/iso3.js";
import {
    defenseRange,
    FALLOUT,
    falloutDoseAt,
    gdpOf,
    PATROL_FIGHTER,
    populationOf,
    UNIT_ICON,
    UNITS,
    vitalityOf
} from "../../game/engine.js";

export default function HoverPopups({hover, hoverEnt, countryByGid, w, mySlot, relation, nationName, labelOf, armOf, teamColor}) {
    return (
        <>
            {hover?.kind === "country" && (() => {
                const gl = countryByGid[hover.gid];
                const nation = w.nations.find((n) => toGid3(n.iso) === hover.gid);
                const name = gl?.name || hover.gid;
                const iso = gl?.iso || nation?.iso;
                const cities = nation ? w.cities.filter((c) => c.slot === nation.slot && c.alive) : [];
                const pop = nation ? populationOf(w, nation.slot) : 0;
                const rows = nation ? [
                    ["Status", nation.slot === mySlot ? "Yours" : relation(nation.slot) === "war" ? "At War" : "At Peace"],
                    ["Standing", cities.length ? "Active" : "Eliminated"],
                    ["Population", fmtPop(pop)],
                    ["GDP", `$${gdpOf(w, nation.slot).toFixed(2)}T`],
                    ["States", cities.length],
                ] : [
                    ["Status", "Non-combatant"],
                    ["Role", "Neutral"],
                ];
                return (
                    <HoverReadout x={hover.x} y={hover.y} clampBottom={190} rows={rows}
                                  header={<>{iso ? <Flag iso={iso}/> : null}<span>{name}</span></>}/>
                );
            })()}
            {hoverEnt && (() => {
                let rows, header, footer = null;
                if (hover.kind === "unit") {
                    const def = UNITS[hoverEnt.type];
                    rows = [["Owner", nationName(hoverEnt.slot)], ["Class", def.kind]];
                    if (def.kind === "industry") {
                        rows.push(["Output", `+${def.output}/s`]);
                        rows.push(["GDP", `+$${def.gdpAdd}T`]);
                    } else {
                        rows.push(["Range", `${Math.round(def.kind === "defense" ? defenseRange(w, hoverEnt) : def.range).toLocaleString()} km`]);
                    }
                    if (armOf(hoverEnt.type, hoverEnt.slot)) rows.push(["Armament", armOf(hoverEnt.type, hoverEnt.slot)]);
                    if (def.navalSpeed) rows.push(["Speed", `${def.navalSpeed} kn${hoverEnt.dest ? " · Sailing" : ""}`]);
                    if (def.airSpeed) rows.push(["Air Spd", `${def.airSpeed} kn`]);
                    if (def.radarKm) rows.push(["Radar", `${def.radarKm} km`]);
                    if (def.wing) rows.push(["Patrol", (hoverEnt.patrolSize ? `${hoverEnt.patrolSize}-${UNITS[PATROL_FIGHTER[hoverEnt.type]]?.rotary ? "Helo" : "Aircraft"}` : "Off") + (hoverEnt.awacsPatrol ? " · AWACS" : "")]);
                    rows.push(["HP", Math.round(hoverEnt.hp)]);
                    rows.push(["Upkeep", `${def.upkeep}/s`]);
                    rows.push(["Target", hoverEnt.targetId ? "Engaged" : "—"]);
                    header = <><UnitIcon name={UNIT_ICON[hoverEnt.type]} color={teamColor(hoverEnt.slot)} size={16}/><span>{labelOf(hoverEnt.type, hoverEnt.slot)}</span></>;
                } else {
                    rows = [
                        ["Nation", nationName(hoverEnt.slot)],
                        ["State", hoverEnt.state || "—"],
                        ["Population", fmtPop(hoverEnt.pop * vitalityOf(hoverEnt))],
                        ["Economy", hoverEnt.econ ? (hoverEnt.econ * 100).toFixed(1) + "%" : "—"],
                        ["HP", `${Math.max(0, Math.round(hoverEnt.hp))}/${hoverEnt.maxHp}`],
                        ["Status", hoverEnt.slot === mySlot ? "Yours" : relation(hoverEnt.slot) === "war" ? "At War" : "At Peace"],
                    ];
                    // Radioactive contamination: only shown when the city sits under an
                    // active fallout cloud. Reports the live loss rate and roughly how
                    // long the hazard lingers.
                    const fo = falloutDoseAt(w, hoverEnt.lng, hoverEnt.lat);
                    if (fo.remain > 0) rows.push(["Fallout", `☢ −${(fo.dose * FALLOUT.dmgPerSec).toFixed(1)} hp/s · ~${Math.ceil(fo.remain)}s`, "text-[#a6ff5c]"]);
                    header = <><span className="w-2.5 h-2.5 rounded-full flex-none" style={{background: teamColor(hoverEnt.slot)}}/><span>{hoverEnt.name}{hoverEnt.cap ? " ★" : ""}</span></>;
                    footer = <Meter frac={vitalityOf(hoverEnt)} fillClass={vitalityOf(hoverEnt) <= 0.35 ? "bg-danger" : "bg-good"} className="mt-2"/>;
                }
                return <HoverReadout x={hover.x} y={hover.y} clampBottom={200} header={header} rows={rows} footer={footer}/>;
            })()}
        </>
    );
}
