// Diplomacy — full-screen theatre manager. A roster of every power in the world:
// flag, name, the seat commanding it (You / AI today, human players in multiplayer),
// holdings, fielded forces, GDP, standing toward you, and the war/peace/alliance
// controls. Presentation only — declareWar/offerPeace/proposeAlliance/breakAlliance
// go through the api.
import {useState} from "react";
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import {colorForSlot, DIPLOMACY} from "../../game/data/constants.js";
import {miniButton, input} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import {fmtGdp} from "../lib/format.js";

export default function DiplomacyScreen({world, api, mySlot, online, onClose}) {
    const [q, setQ] = useState("");
    const me = world.nations.find((n) => n.slot === mySlot);
    // Only the ACTIVE (participating) powers are diplomatic actors — the passive neutral
    // world never wars or allies, so it never appears here. In an all-active match this
    // is every nation.
    const roster = world.nations.filter((n) => n.active !== false);
    // Precompute holdings/forces per slot in one pass each (indexed by slot, so it's
    // cheap regardless of how many cities/units exist).
    const cityCount = {}, forceCount = {};
    for (const c of world.cities) if (c.alive) cityCount[c.slot] = (cityCount[c.slot] || 0) + 1;
    for (const u of world.units) if (u.hp > 0) forceCount[u.slot] = (forceCount[u.slot] || 0) + 1;
    const citiesOf = (slot) => cityCount[slot] || 0;
    const forcesOf = (slot) => forceCount[slot] || 0;
    // Your standing toward a slot: "war" | "ally" | "peace" (absent reads as peace).
    const rel = (n) => (n.slot === mySlot ? "self" : me?.relations[n.slot] === "war" ? "war" : me?.relations[n.slot] === "ally" ? "ally" : "peace");
    // Diplomatic sort priority — the powers that matter to you rise to the top: you,
    // then human players, then everyone you're at war with, then your allies, then
    // the rest. Ties within a bucket fall back to alive-then-holdings.
    const priority = (n) => n.slot === mySlot ? 0 : (online && n.isAi === false && n.alive) ? 1 : rel(n) === "war" ? 2 : rel(n) === "ally" ? 3 : 4;
    const nations = [...roster].sort((a, b) =>
        priority(a) - priority(b) || (b.alive - a.alive) || citiesOf(b.slot) - citiesOf(a.slot));
    // Rank is TRUE standings (alive-then-holdings), computed off a separate sort so the
    // diplomatic display order above never distorts each power's real rank.
    const standings = [...roster].sort((a, b) => (b.alive - a.alive) || citiesOf(b.slot) - citiesOf(a.slot));
    const rankOf = new Map(standings.map((n, i) => [n.slot, i + 1]));

    const graceSec = world.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec;
    const graceActive = graceSec > 0 && (world.time ?? 0) < graceSec;
    const aliveCount = roster.filter((n) => n.alive).length;
    const atWar = roster.filter((n) => n.slot !== mySlot && me?.relations[n.slot] === "war").length;
    const allied = roster.filter((n) => n.slot !== mySlot && me?.relations[n.slot] === "ally").length;
    const needle = q.trim().toLowerCase();
    // The active powers are few (≤8), so the default view simply shows them all; the
    // search box filters that roster by name/ISO.
    const shown = needle
        ? nations.filter((n) => n.name.toLowerCase().includes(needle) || n.iso.toLowerCase() === needle)
        : nations;

    const seat = (n) => n.slot === mySlot ? {label: "You", cls: "text-gold-contrast bg-gold border-gold"} : n.isAi ? {label: "AI", cls: ""} : {label: "Player", cls: "text-[#5fa8ff] border-[#3f5a80]"};

    const rowGrid = "grid grid-cols-[52px_minmax(200px,2fr)_96px_76px_76px_88px_116px_190px] items-center gap-3 px-[14px] py-[11px] border-b border-hair";

    return (
        <ScreenFrame title="DIPLOMACY" subtitle="Theatre powers & standings" bare onClose={onClose}
                     foot={<span className="block px-[22px] py-[10px] border-t border-line-soft font-mono text-[10px] tracking-[1px] text-faint text-center">The active powers contesting this match — AI today, human players once multiplayer lands</span>}>
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
                        <span className="text-[9px] tracking-[1.2px] uppercase text-faint">Your Alliances</span>
                        <b className={cn("font-mono text-lg", allied && "text-[#5fa8ff]")}>{allied}</b>
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
                        const standing = rel(n);       // "self" | "war" | "ally" | "peace"
                        const war = standing === "war";
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
                                <span className="text-right font-mono text-xs" role="cell">{fmtGdp(n.gdp, 1)}</span>
                                <span role="cell">
                                    {isMe ? <span className="font-mono text-[11px] text-dim">Home</span>
                                        : !n.alive ? <span className="font-mono text-[11px] text-dim">Eliminated</span>
                                            : war ? <span className="font-mono text-[11px] text-red">At War</span>
                                                : standing === "ally" ? <span className="font-mono text-[11px] text-[#5fa8ff]">Allied</span>
                                                    : <span className="font-mono text-[11px] text-[#46d38a]">At Peace</span>}
                                </span>
                                <span className="flex justify-end gap-[6px]" role="cell">
                                    {isMe || !n.alive ? <span className="text-faint">—</span>
                                        : war
                                            ? (online
                                                ? <span className="font-mono text-[10px] text-faint" title="Peace terms are single-player only for now">Peace: solo only</span>
                                                : <button className={miniButton()} aria-label={`Offer white peace to ${n.name}`}
                                                          onClick={() => api.offerPeace(n.slot)}>Offer Peace</button>)
                                            : standing === "ally"
                                                ? (online
                                                    ? <span className="font-mono text-[10px] text-faint" title="Alliance terms are single-player only for now">Ally: solo only</span>
                                                    : <button className={miniButton({danger: true})} aria-label={`Break the alliance with ${n.name}`}
                                                              onClick={() => api.breakAlliance(n.slot)}>Break Alliance</button>)
                                                : (
                                                    <>
                                                        {!online &&
                                                            <button className={miniButton()} aria-label={`Propose an alliance to ${n.name}`}
                                                                    onClick={() => api.proposeAlliance(n.slot)}>Ally</button>}
                                                        <button className={miniButton({danger: true})} aria-label={`Declare war on ${n.name}`}
                                                                disabled={graceActive}
                                                                title={graceActive ? "Opening grace — no wars can be declared yet." : undefined}
                                                                onClick={() => api.declareWar(n.slot)}>Declare War</button>
                                                    </>
                                                )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ScreenFrame>
    );
}
