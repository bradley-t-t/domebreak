import Flag from "../common/Flag.jsx";
import {colorForSlot} from "../../game/data/constants.js";
import {overlay, card, menuTitle, iconButton} from "../lib/variants.js";
import Icon from "../common/Icon.jsx";
import {cn} from "../lib/cn.js";
import {fmtGdp, fmtPop} from "../lib/format.js";
import {useRoster} from "../lib/roster.js";
import PopTrend from "../common/PopTrend.jsx";
import {gdpOf, populationOf, populationTrendOf} from "../../game/engine.js";

// In-game scoreboard. Hold Tab to reveal, release to hide (Esc or ✕ also
// close). Every active power in the match — including eliminated ones,
// shown ghosted with an "Eliminated" tag — with flag, country, seat
// (You / online commander / AI), holdings and standing at a glance. Reads
// engine queries only; never mutates. In multiplayer the netClient's roster
// supplies each human's username; AI seats stay labelled AI in both single-
// and multi-player.
export default function PlayerListOverlay({world, mySlot, players, onOpenCountry, onClose}) {
    const {usernameOf, isHuman} = useRoster(players);

    const me = world.nations.find((n) => n.slot === mySlot);
    const roster = world.nations.filter((n) => n.active !== false);

    const cityCount = {}, forceCount = {};
    for (const c of world.cities) if (c.alive) cityCount[c.slot] = (cityCount[c.slot] || 0) + 1;
    for (const u of world.units) if (u.hp > 0) forceCount[u.slot] = (forceCount[u.slot] || 0) + 1;
    const citiesOf = (slot) => cityCount[slot] || 0;
    const forcesOf = (slot) => forceCount[slot] || 0;

    // Alive first, then more cities, then higher GDP — same rank ordering the
    // Diplomacy screen uses.
    const standings = [...roster].sort((a, b) =>
        (b.alive - a.alive) ||
        citiesOf(b.slot) - citiesOf(a.slot) ||
        gdpOf(world, b.slot) - gdpOf(world, a.slot)
    );

    const relOf = (n) => {
        if (n.slot === mySlot) return "self";
        const r = me?.relations[n.slot];
        return r === "war" ? "war" : r === "ally" ? "ally" : "peace";
    };
    const seatOf = (n) => {
        if (n.slot === mySlot) return {label: "You", cls: "text-gold-contrast bg-gold border-gold"};
        if (isHuman(n.slot)) return {label: "Player", cls: "text-[#5fa8ff] border-[#3f5a80]"};
        return {label: "AI", cls: ""};
    };
    const commanderOf = (n) => {
        if (n.slot === mySlot) return "You";
        if (isHuman(n.slot)) return usernameOf.get(n.slot) || "Commander";
        return null;
    };

    const rowGrid = "grid grid-cols-[36px_minmax(180px,2fr)_minmax(140px,1.2fr)_64px_64px_72px_78px_92px] items-center gap-3 px-[14px] py-[10px] border-b border-hair";

    return (
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={cn(card(), "w-[min(900px,96vw)] max-h-[86vh] overflow-y-auto text-left")}
                 role="dialog" aria-modal="true" aria-labelledby="db-players-title"
                 onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                        <div className={menuTitle({sm: true})} id="db-players-title">Players</div>
                        <div className="font-mono text-[11px] tracking-[0.02em] text-dim mt-1">Every active power in this match — release Tab to close</div>
                    </div>
                    <button className={iconButton()} onClick={onClose} title="Close (Esc)" aria-label="Close player list"><Icon name="close" size={15}/>
                    </button>
                </div>
                <div className="mt-3" role="table" aria-label="Players in this match">
                    <div className={cn(rowGrid, "sticky top-0 z-[1] bg-panel-solid border-b border-line text-[9px] tracking-[1.2px] uppercase text-faint")} role="row">
                        <span className="text-right font-mono text-xs text-faint" role="columnheader">#</span>
                        <span role="columnheader">Power</span>
                        <span role="columnheader">Commander</span>
                        <span className="text-right font-mono text-xs" role="columnheader">Cities</span>
                        <span className="text-right font-mono text-xs" role="columnheader">Forces</span>
                        <span className="text-right font-mono text-xs" role="columnheader">Pop</span>
                        <span className="text-right font-mono text-xs" role="columnheader">GDP</span>
                        <span role="columnheader">Standing</span>
                    </div>
                    {standings.map((n, i) => {
                        const isMe = n.slot === mySlot;
                        const r = relOf(n);
                        const s = seatOf(n);
                        const cmd = commanderOf(n);
                        const open = onOpenCountry ? () => onOpenCountry(n.slot) : undefined;
                        const pop = n.alive ? populationOf(world, n.slot) : 0;
                        return (
                            <div key={n.slot}
                                 className={cn(rowGrid, !n.alive && "opacity-50", isMe && "bg-[rgba(245,197,49,0.05)]", open && "cursor-pointer hover:bg-[rgba(255,255,255,0.03)]")}
                                 role={open ? "button" : "row"} tabIndex={open ? 0 : undefined}
                                 aria-current={isMe ? "true" : undefined}
                                 aria-label={open ? `Open ${n.name} dossier` : undefined}
                                 onClick={open}
                                 onKeyDown={open ? (e) => {
                                     if (e.key === "Enter" || e.key === " ") {
                                         e.preventDefault();
                                         open();
                                     }
                                 } : undefined}>
                                <span className="text-right font-mono text-xs text-faint" role="cell">{i + 1}</span>
                                <span className="flex items-center gap-[11px] min-w-0" role="rowheader">
                                    <span className="flex-none w-[30px] h-[20px] grid place-items-center overflow-hidden border rounded-[3px] [&>*]:w-full [&>*]:h-full [&>*]:object-cover"
                                          style={{borderColor: n.color || colorForSlot(n.slot)}}>
                                        <Flag iso={n.iso}/>
                                    </span>
                                    <b className="font-display font-semibold text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">{n.name}</b>
                                </span>
                                <span className="flex items-center gap-[8px] min-w-0" role="cell">
                                    <span className={cn("inline-block px-[8px] py-[2px] font-mono text-[9.5px] tracking-[0.5px] border border-line rounded-full text-dim whitespace-nowrap", s.cls)}>{s.label}</span>
                                    {cmd && <span className="text-[11.5px] text-dim whitespace-nowrap overflow-hidden text-ellipsis">{cmd}</span>}
                                </span>
                                <span className="text-right font-mono text-xs" role="cell">{n.alive ? citiesOf(n.slot) : "—"}</span>
                                <span className="text-right font-mono text-xs" role="cell">{n.alive ? forcesOf(n.slot) : "—"}</span>
                                <span className="text-right font-mono text-xs inline-flex items-center justify-end gap-[3px]" role="cell">{n.alive ? fmtPop(pop) : "—"}
                                    {n.alive && <PopTrend rate={populationTrendOf(world, n.slot)} base={pop} className="text-[9px]"/>}</span>
                                <span className="text-right font-mono text-xs" role="cell">{n.alive ? fmtGdp(gdpOf(world, n.slot), 1) : "—"}</span>
                                <span role="cell">
                                    {isMe ? <span className="font-mono text-[11px] text-dim">Home</span>
                                        : !n.alive ? <span className="font-mono text-[11px] text-dim">Eliminated</span>
                                            : r === "war" ? <span className="font-mono text-[11px] text-red">At War</span>
                                                : r === "ally" ? <span className="font-mono text-[11px] text-[#5fa8ff]">Allied</span>
                                                    : <span className="font-mono text-[11px] text-[#46d38a]">At Peace</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
