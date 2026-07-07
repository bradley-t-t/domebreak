// Tech-tree node card — extracted from TechTree.jsx so the atlas screen isn't
// dominated by a single card renderer. Presentation only: all state still
// flows through the engine via api.research / api.unqueue.
import {canQueue, TECH_PATHS, TECHS, UNIT_ICON, unitLabel} from "../../game/engine.js";
import UnitIcon from "../common/UnitIcon.jsx";
import {cn} from "../lib/cn.js";

// State literal kept on .db-tt-node so the CSS drafting layer (index.css @layer
// vfx) can theme each state, plus the hover/active micro-motion for available
// nodes expressed as self-referencing arbitrary variants off the same literal.
const NODE_STATE_CLS = {
    done: "done",
    cur: "cur",
    queued: "queued",
    avail: "avail [&.avail:hover]:-translate-y-px [&.avail:active]:scale-[0.99]",
    availPoor: "avail poor [&.avail:hover]:-translate-y-px [&.avail:active]:scale-[0.99]",
    locked: "locked",
};

// A spec-sheet row: label ···· value, with a dotted engineering leader between
// them (the drafting device that makes a blueprint read as a blueprint).
function SpecRow({label, value, muted}) {
    return (
        <span className="relative flex items-center gap-1.5 font-mono text-[9px] leading-[1.5]">
            <span className="text-faint tracking-[1px]">{label}</span>
            <span className="db-tt-leader flex-1 self-center" aria-hidden="true"/>
            <span className={cn("tabular-nums whitespace-nowrap overflow-hidden text-ellipsis",
                muted ? "text-faint max-w-[104px]" : "text-dim")}>{value}</span>
        </span>
    );
}

// Blueprint / schematic tech node — a drafting card: hairline frame with corner
// ticks, a designation code (OFF-03), a stamped status, a mono spec sheet with
// dotted leaders, and a schematically-framed payload icon for unit unlocks.
export default function Node({id, tech, nation, api, style}) {
    const rr = nation?.research || {queue: [], done: [], current: null};
    const done = rr.done.includes(id);
    const isCur = rr.current?.id === id;
    const qi = rr.queue.indexOf(id);
    const avail = !done && !isCur && qi < 0 && canQueue(nation, id);
    const locked = !done && !isCur && qi < 0 && !avail;
    const poor = avail && (nation?.points ?? 0) < tech.cost;
    const pct = Math.floor((rr.current?.progress ?? 0) * 100);
    const stateCls = done ? NODE_STATE_CLS.done
        : isCur ? NODE_STATE_CLS.cur
            : qi >= 0 ? NODE_STATE_CLS.queued
                : avail ? (poor ? NODE_STATE_CLS.availPoor : NODE_STATE_CLS.avail)
                    : NODE_STATE_CLS.locked;
    // Drafting designation, e.g. "OFF-03" — track code + zero-padded tier.
    const code = `${tech.path.toUpperCase()}-${String(tech.tier).padStart(2, "0")}`;
    const glyph = TECH_PATHS.find((p) => p.id === tech.path)?.glyph;
    // Stamped status label sitting in the card header.
    const stamp = done ? "FIELDED" : isCur ? `PLOTTING ${pct}%`
        : qi >= 0 ? `QUEUED ${qi + 1}` : poor ? "LOW ◆" : avail ? "READY" : "LOCKED";
    // Techs with `unlocks` grant a new buildable unit on completion — the payload.
    const unlockType = tech.unlocks;
    const unlockName = unlockType ? unitLabel(unlockType) : null;
    const reqName = tech.req ? TECHS[tech.req]?.name : null;
    // Full spoken description for screen readers: name → state → cost/time → payoff.
    const state = done ? "Done"
        : isCur ? `In Progress ${pct}%`
            : qi >= 0 ? `Queued #${qi + 1}`
                : avail ? (poor ? `Available — insufficient points (need ${tech.cost})` : "Available")
                    : "Locked";
    const ariaLabel = [
        `${tech.name}.`, `${state}.`,
        (!done && !isCur) ? `Costs ${tech.cost} points, ${tech.time} seconds.` : null,
        (locked && reqName) ? `Requires ${reqName}.` : null,
        unlockName ? `Unlocks ${unlockName}.` : null,
    ].filter(Boolean).join(" ");
    const onClick = () => {
        if (avail && !poor) api.research(id);
        else if (qi >= 0) api.unqueue(id);
    };
    return (
        <button className={cn(
            "db-tt-node relative overflow-hidden w-[196px] flex-none flex flex-col text-left",
            "px-[13px] pt-[9px] pb-[11px] rounded-[3px] text-text bg-sunk",
            "transition-[transform,box-shadow] duration-150 ease-out-db",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2",
            stateCls,
        )}
                style={style} onClick={onClick}
                disabled={locked || done || isCur || (poor && avail)}
                aria-label={ariaLabel}
                title={locked ? "Requires the previous tech." : poor ? `Need ◆ ${tech.cost}` : tech.desc}>
            {/* schematic plot-fill for the tech under active research */}
            {isCur &&
                <i className="db-tt-fill absolute inset-y-0 left-0 right-auto pointer-events-none"
                   style={{width: `${Math.min(100, pct)}%`}} aria-hidden="true"/>}
            {/* drafting frame — hairline border + corner tick marks */}
            <span className="db-tt-frame absolute inset-0 pointer-events-none" aria-hidden="true"/>

            {/* header: designation code + stamped status */}
            <span className="relative flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[1.4px] text-faint whitespace-nowrap">
                    <span aria-hidden="true">{glyph}</span> {code}
                </span>
                <span className="db-tt-stamp flex-none font-mono text-[8px] tracking-[1.3px] whitespace-nowrap px-[5px] py-[1.5px]"
                      aria-hidden="true">{stamp}</span>
            </span>

            {/* tech name + one-line brief */}
            <span className="relative font-display font-bold text-[12.5px] leading-[1.14] mt-[6px]">{tech.name}</span>
            <span className="relative text-[9.5px] text-dim leading-[1.3] mt-[2px] line-clamp-2">{tech.desc}</span>

            {/* spec sheet */}
            <span className="db-tt-rule relative block mt-[6px] mb-[4px]" aria-hidden="true"/>
            <SpecRow label="COST" value={`◆ ${tech.cost}`}/>
            <SpecRow label="TIME" value={`${tech.time}s`}/>
            {(locked || avail) && reqName && <SpecRow label="REQ" value={reqName} muted/>}

            {/* payload — the unit this tech puts in the field */}
            {unlockType && (
                <span className="db-tt-payload relative flex items-center gap-2 mt-[7px] pt-[7px]"
                      title={`Unlocks: ${unlockName}`}>
                    <span className="db-tt-payload-icon flex-none grid place-items-center w-[26px] h-[26px]">
                        <UnitIcon name={UNIT_ICON[unlockType]} size={21}/>
                    </span>
                    <span className="flex flex-col gap-px overflow-hidden">
                        <span className="font-mono text-[7.5px] tracking-[1.8px] uppercase text-faint leading-none">Payload</span>
                        <span className="font-display font-semibold text-[11px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {unlockName}
                        </span>
                    </span>
                </span>
            )}
        </button>
    );
}
