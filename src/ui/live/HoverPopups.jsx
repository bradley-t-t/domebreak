// The two on-map hover readouts — the zoomed-out whole-country tooltip and the
// zoomed-in city/unit tooltip — fed by LiveGame's hover probe (onMove) and
// its pre-filtered hoverEnt lookup. `pos` is LiveGame's mutated cursor-position
// ref value ({x, y}) — read fresh on every render rather than carried in hover
// state, so cursor motion alone never re-renders the tree.
import Flag from "../common/Flag.jsx";
import Meter from "../common/Meter.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import HoverReadout from "./HoverReadout.jsx";
import {cn} from "../lib/cn.js";
import {popoverCard} from "../lib/variants.js";
import {fmtGdp, fmtKm, fmtPop} from "../lib/format.js";
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

export default function HoverPopups({hover, hoverEnt, pos, countryByGid, w, mySlot, relation, nationName, labelOf, armOf, teamColor}) {
    return (
        <>
            {hover?.kind === "country" && (() => {
                const gl = countryByGid[hover.gid];
                const nation = w.nations.find((n) => toGid3(n.iso) === hover.gid);
                const name = gl?.name || hover.gid;
                const iso = gl?.iso || nation?.iso;
                // Neutral: a country outside w.nations, or an inactive (non-participating)
                // nation. Both are pure scenery — swap the details readout for a plaque.
                // A nation wiped out in war is inactive too, but gets the defeated plaque.
                const neutral = !nation || nation.active === false;
                if (neutral) {
                    return <NeutralReadout x={pos.x} y={pos.y} wiped={!!nation?.wipedOut}
                                           header={<>{iso ? <Flag iso={iso}/> : null}<span>{name}</span></>}/>;
                }
                const cities = w.cities.filter((c) => c.slot === nation.slot && c.alive);
                const pop = populationOf(w, nation.slot);
                const rows = [
                    ["Status", nation.slot === mySlot ? "Yours" : relation(nation.slot) === "war" ? "At War" : "At Peace"],
                    ["Standing", cities.length ? "Active" : "Eliminated"],
                    ["Population", fmtPop(pop)],
                    ["GDP", fmtGdp(gdpOf(w, nation.slot))],
                    ["States", cities.length],
                ];
                return (
                    <HoverReadout x={pos.x} y={pos.y} clampBottom={190} rows={rows}
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
                        rows.push(["Range", fmtKm(def.kind === "defense" ? defenseRange(w, hoverEnt) : def.range)]);
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
                return <HoverReadout x={pos.x} y={pos.y} clampBottom={200} header={header} rows={rows} footer={footer}/>;
            })()}
        </>
    );
}

// The map hover plaque for a neutral (non-participating) country, or a nation wiped
// out in war (`wiped`). Reuses the shared popover shell and cursor-flip math from
// HoverReadout but drops the stat grid — a neutral is scenery, so there's nothing to
// report beyond the name and its status.
function NeutralReadout({x, y, header, wiped}) {
    const left = x + 18 > window.innerWidth - 250 ? Math.max(12, x - 248) : x + 18;
    const top = Math.min(Math.max(60, y - 14), window.innerHeight - 170);
    return (
        <div className={cn(popoverCard(), "fixed z-6 min-w-[206px] max-w-[244px] py-[11px] px-[13px] pb-3")}
             style={{left, top}} aria-hidden="true">
            <div className="flex items-center gap-2 font-display font-bold text-[13.5px] tracking-[0.2px]">{header}</div>
            <div className="mt-[10px] inline-flex items-center gap-[6px] px-[8px] py-[3px] rounded-full border border-line-soft text-[10px] tracking-[0.8px] uppercase text-dim">
                <span>{wiped ? "Wiped Out" : "Neutral Territory"}</span>
            </div>
            <p className="mt-[9px] text-[11.5px] leading-[1.45] text-dim">
                {wiped
                    ? "Beaten below the surrender line and knocked out of the war — its remnant land now lies open."
                    : "Not participating in this game — this country stays neutral throughout the match."}
            </p>
        </div>
    );
}
