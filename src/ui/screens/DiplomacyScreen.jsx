// Diplomacy — full-screen theatre manager. A roster of every power in the world:
// flag, name, the seat commanding it (You / AI today, human players in multiplayer),
// holdings, fielded forces, GDP, standing toward you, and the war/peace control.
// Presentation only — declareWar/makePeace go through the api.
import {useState} from "react";
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import {colorForSlot} from "../../game/data/constants.js";
import {miniButton, input} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

export default function DiplomacyScreen({world, api, mySlot, onClose}) {
    const [q, setQ] = useState("");
    const me = world.nations.find((n) => n.slot === mySlot);
    // Precompute holdings/forces per slot in one pass each — the roster is the whole
    // world now (~222 nations), so a per-row cities.filter() would be O(nations × cities).
    const cityCount = {}, forceCount = {};
    for (const c of world.cities) if (c.alive) cityCount[c.slot] = (cityCount[c.slot] || 0) + 1;
    for (const u of world.units) if (u.hp > 0) forceCount[u.slot] = (forceCount[u.slot] || 0) + 1;
    const citiesOf = (slot) => cityCount[slot] || 0;
    const forcesOf = (slot) => forceCount[slot] || 0;
    // Self first, then living powers by holdings, then the eliminated — readable standings.
    const nations = [...world.nations].sort((a, b) =>
        (a.slot === mySlot ? -1 : b.slot === mySlot ? 1 : 0) || (b.alive - a.alive) || citiesOf(b.slot) - citiesOf(a.slot));
    // True standings rank per slot, so a filtered view still shows each power's real rank.
    const rankOf = new Map(nations.map((n, i) => [n.slot, i + 1]));

    const aliveCount = world.nations.filter((n) => n.alive).length;
    const atWar = world.nations.filter((n) => n.slot !== mySlot && me?.relations[n.slot] === "war").length;
    const needle = q.trim().toLowerCase();
    // Default view keeps the list legible: you, everyone you're at war with, and the
    // top powers by holdings. A search box reaches any of the ~222 nations by name/ISO.
    const shown = needle
        ? nations.filter((n) => n.name.toLowerCase().includes(needle) || n.iso.toLowerCase() === needle)
        : nations.filter((n, i) => n.slot === mySlot || (n.alive && me?.relations[n.slot] === "war") || i < 40);

    const seat = (n) => n.slot === mySlot ? {label: "You", cls: "text-gold-contrast bg-gold border-gold"} : n.isAi ? {label: "AI", cls: ""} : {label: "Player", cls: "text-[#5fa8ff] border-[#3f5a80]"};

    const rowGrid = "grid grid-cols-[52px_minmax(200px,2fr)_96px_76px_76px_88px_116px_150px] items-center gap-3 px-[14px] py-[11px] border-b border-hair";

    return (
        <ScreenFrame title="DIPLOMACY" subtitle="Theatre powers & standings" bare onClose={onClose}
                     foot={<span className="block px-[22px] py-[10px] border-t border-line-soft font-mono text-[10px] tracking-[1px] text-faint text-center">Every country on the map is a live power — AI today, human players once multiplayer lands</span>}>
            <div className="flex flex-col gap-4 h-full px-6 py-5 overflow-hidden">
                <div className="flex gap-[10px] flex-wrap">
                    <div className="flex-1 min-w-[150px] flex flex-col gap-[3px] px-[14px] py-3 bg-sunk border border-line rounded">
                        <span className="text-[9px] tracking-[1.2px] uppercase text-faint">Powers Standing</span>
                        <b className="font-mono text-lg">{aliveCount}</b>
                    </div>
                    <div className="flex-1 min-w-[150px] flex flex-col gap-[3px] px-[14px] py-3 bg-sunk border border-line rounded">
                        <span className="text-[9px] tracking-[1.2px] uppercase text-faint">You Are At War With</span>
                        <b className={cn("font-mono text-lg", atWar && "text-red")}>{atWar}</b>
                    </div>
                    <div className="flex-1 min-w-[150px] flex flex-col gap-[3px] px-[14px] py-3 bg-sunk border border-line rounded">
                        <span className="text-[9px] tracking-[1.2px] uppercase text-faint">Your Holdings</span>
                        <b className="font-mono text-lg">{citiesOf(mySlot)} cities</b>
                    </div>
                    <div className="flex-1 min-w-[150px] flex flex-col gap-[3px] px-[14px] py-3 bg-sunk border border-line rounded">
                        <span className="text-[9px] tracking-[1.2px] uppercase text-faint">Your Forces</span>
                        <b className="font-mono text-lg">{forcesOf(mySlot)} units</b>
                    </div>
                </div>

                <input className={cn(input(), "mb-[10px]")} placeholder="Search all powers by name…" value={q}
                       onChange={(e) => setQ(e.target.value)}
                       aria-label="Search all powers by name"/>

                <div className="db-scroll flex-1 overflow-auto flex flex-col" role="table">
                    <div className={cn(rowGrid, "sticky top-0 z-[1] bg-panel-solid border-b border-line text-[9px] tracking-[1.2px] uppercase text-faint")} role="row">
                        <span className="text-right font-mono text-xs text-faint" role="columnheader">Rank</span>
                        <span role="columnheader">Power</span><span role="columnheader">Seat</span>
                        <span className="text-right font-mono text-xs" role="columnheader">Cities</span>
                        <span className="text-right font-mono text-xs" role="columnheader">Forces</span>
                        <span className="text-right font-mono text-xs" role="columnheader">GDP</span>
                        <span role="columnheader">Standing</span>
                        <span className="text-right" role="columnheader">Relations</span>
                    </div>
                    {shown.map((n) => {
                        const isMe = n.slot === mySlot;
                        const war = !isMe && me?.relations[n.slot] === "war";
                        const s = seat(n);
                        return (
                            <div key={n.slot}
                                 className={cn(rowGrid, !n.alive && "opacity-50", isMe && "bg-[rgba(245,197,49,0.05)]")}
                                 role="row" aria-current={isMe ? "true" : undefined}>
                                <span className="text-right font-mono text-xs text-faint" role="cell">№{rankOf.get(n.slot)}</span>
                                <span className="flex items-center gap-[11px] min-w-0" role="rowheader">
                                    <span className="flex-none w-[34px] h-[22px] grid place-items-center overflow-hidden border rounded-[3px] [&>*]:w-full [&>*]:h-full [&>*]:object-cover"
                                          style={{borderColor: n.color || colorForSlot(n.slot)}}>
                                        <Flag iso={n.iso}/></span>
                                    <b className="font-display font-semibold text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">{n.name}</b>
                                </span>
                                <span role="cell"><span className={cn("inline-block px-[10px] py-[3px] font-mono text-[10px] tracking-[0.5px] border border-line rounded-full text-dim", s.cls)}>{s.label}</span></span>
                                <span className="text-right font-mono text-xs" role="cell">{n.alive ? citiesOf(n.slot) : "—"}</span>
                                <span className="text-right font-mono text-xs" role="cell">{n.alive ? forcesOf(n.slot) : "—"}</span>
                                <span className="text-right font-mono text-xs" role="cell">${(n.gdp ?? 0).toFixed(1)}T</span>
                                <span role="cell">
                                    {isMe ? <span className="font-mono text-[11px] text-dim">Home</span>
                                        : !n.alive ? <span className="font-mono text-[11px] text-dim">Eliminated</span>
                                            : war ? <span className="font-mono text-[11px] text-red">At War</span>
                                                : <span className="font-mono text-[11px] text-[#46d38a]">At Peace</span>}
                                </span>
                                <span className="text-right" role="cell">
                                    {isMe || !n.alive ? <span className="text-faint">—</span>
                                        : war
                                            ? <button className={miniButton()} aria-label={`Sue for peace with ${n.name}`}
                                                      onClick={() => api.makePeace(n.slot)}>Sue for Peace</button>
                                            : <button className={miniButton({danger: true})} aria-label={`Declare war on ${n.name}`}
                                                      onClick={() => api.declareWar(n.slot)}>Declare War</button>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ScreenFrame>
    );
}
