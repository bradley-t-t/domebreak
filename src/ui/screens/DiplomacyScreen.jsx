// Diplomacy — full-screen theatre manager. A roster of every power in the world:
// flag, name, the seat commanding it (You / AI today, human players in multiplayer),
// holdings, fielded forces, GDP, standing toward you, and the war/peace control.
// Presentation only — declareWar/makePeace go through the api.
import {useState} from "react";
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import {colorForSlot} from "../../game/data/constants.js";

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

    const aliveCount = world.nations.filter((n) => n.alive).length;
    const atWar = world.nations.filter((n) => n.slot !== mySlot && me?.relations[n.slot] === "war").length;
    const needle = q.trim().toLowerCase();
    // Default view keeps the list legible: you, everyone you're at war with, and the
    // top powers by holdings. A search box reaches any of the ~222 nations by name/ISO.
    const shown = needle
        ? nations.filter((n) => n.name.toLowerCase().includes(needle) || n.iso.toLowerCase() === needle)
        : nations.filter((n, i) => n.slot === mySlot || (n.alive && me?.relations[n.slot] === "war") || i < 40);

    const seat = (n) => n.slot === mySlot ? {label: "You", cls: "you"} : n.isAi ? {label: "AI", cls: "ai"} : {label: "Player", cls: "human"};

    return (
        <ScreenFrame title="DIPLOMACY" subtitle="Theatre powers & standings" bare onClose={onClose}
                     foot="Every country on the map is a live power — AI today, human players once multiplayer lands">
            <div className="gd-dip">
                <div className="gd-dip-summary">
                    <div className="gd-dip-stat"><span>Powers Standing</span><b>{aliveCount}</b></div>
                    <div className="gd-dip-stat"><span>You Are At War With</span><b
                        className={atWar ? "neg" : ""}>{atWar}</b></div>
                    <div className="gd-dip-stat"><span>Your Holdings</span><b>{citiesOf(mySlot)} cities</b></div>
                    <div className="gd-dip-stat"><span>Your Forces</span><b>{forcesOf(mySlot)} units</b></div>
                </div>

                <input className="gd-input" placeholder="Search all powers by name…" value={q}
                       onChange={(e) => setQ(e.target.value)} style={{margin: "0 0 10px"}}/>

                <div className="gd-dip-table" role="table">
                    <div className="gd-dip-row head" role="row">
                        <span>Power</span><span>Seat</span><span className="num">Cities</span>
                        <span className="num">Forces</span><span className="num">GDP</span>
                        <span>Standing</span><span className="act">Relations</span>
                    </div>
                    {shown.map((n) => {
                        const isMe = n.slot === mySlot;
                        const war = !isMe && me?.relations[n.slot] === "war";
                        const s = seat(n);
                        return (
                            <div key={n.slot} className={`gd-dip-row ${!n.alive ? "dead" : ""} ${isMe ? "self" : ""}`}
                                 role="row">
                                <span className="gd-dip-power">
                                    <span className="gd-dip-flag" style={{borderColor: n.color || colorForSlot(n.slot)}}>
                                        <Flag iso={n.iso}/></span>
                                    <b>{n.name}</b>
                                </span>
                                <span><span className={`gd-seat ${s.cls}`}>{s.label}</span></span>
                                <span className="num">{n.alive ? citiesOf(n.slot) : "—"}</span>
                                <span className="num">{n.alive ? forcesOf(n.slot) : "—"}</span>
                                <span className="num">${(n.gdp ?? 0).toFixed(1)}T</span>
                                <span>
                                    {isMe ? <span className="gd-standing self">Home</span>
                                        : !n.alive ? <span className="gd-standing">Eliminated</span>
                                            : war ? <span className="gd-standing war">At War</span>
                                                : <span className="gd-standing peace">At Peace</span>}
                                </span>
                                <span className="act">
                                    {isMe || !n.alive ? <span className="gd-dip-dash">—</span>
                                        : war
                                            ? <button className="gd-mini"
                                                      onClick={() => api.makePeace(n.slot)}>Sue for Peace</button>
                                            : <button className="gd-mini danger"
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
