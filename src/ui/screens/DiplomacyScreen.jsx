// Diplomacy — full-screen theatre manager. A roster of every power that fills the
// frame: flag, name, the seat commanding it (You / AI today, human players in
// multiplayer), holdings, fielded forces, GDP, standing toward you, and the
// war/peace control. Presentation only — declareWar/makePeace go through the api.
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import {SLOT_COLOR} from "../../game/data/constants.js";

export default function DiplomacyScreen({world, api, mySlot, onClose}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const citiesOf = (slot) => world.cities.filter((c) => c.slot === slot && c.alive).length;
    const forcesOf = (slot) => world.units.filter((u) => u.slot === slot).length;
    // Self first, then living powers, then the eliminated — a readable standings order.
    const nations = [...world.nations].sort((a, b) =>
        (a.slot === mySlot ? -1 : b.slot === mySlot ? 1 : 0) || (b.alive - a.alive) || citiesOf(b.slot) - citiesOf(a.slot));

    const aliveCount = world.nations.filter((n) => n.alive).length;
    const atWar = world.nations.filter((n) => n.slot !== mySlot && me?.relations[n.slot] === "war").length;

    const seat = (n) => n.slot === mySlot ? {label: "You", cls: "you"} : n.isAi ? {label: "AI", cls: "ai"} : {label: "Player", cls: "human"};

    return (
        <ScreenFrame title="DIPLOMACY" subtitle="Theatre powers & standings" bare onClose={onClose}
                     foot="Seats show who commands each power — AI today, human players once multiplayer lands">
            <div className="gd-dip">
                <div className="gd-dip-summary">
                    <div className="gd-dip-stat"><span>Powers Standing</span><b>{aliveCount}</b></div>
                    <div className="gd-dip-stat"><span>You Are At War With</span><b
                        className={atWar ? "neg" : ""}>{atWar}</b></div>
                    <div className="gd-dip-stat"><span>Your Holdings</span><b>{citiesOf(mySlot)} cities</b></div>
                    <div className="gd-dip-stat"><span>Your Forces</span><b>{forcesOf(mySlot)} units</b></div>
                </div>

                <div className="gd-dip-table" role="table">
                    <div className="gd-dip-row head" role="row">
                        <span>Power</span><span>Seat</span><span className="num">Cities</span>
                        <span className="num">Forces</span><span className="num">GDP</span>
                        <span>Standing</span><span className="act">Relations</span>
                    </div>
                    {nations.map((n) => {
                        const isMe = n.slot === mySlot;
                        const war = !isMe && me?.relations[n.slot] === "war";
                        const s = seat(n);
                        return (
                            <div key={n.slot} className={`gd-dip-row ${!n.alive ? "dead" : ""} ${isMe ? "self" : ""}`}
                                 role="row">
                                <span className="gd-dip-power">
                                    <span className="gd-dip-flag" style={{borderColor: SLOT_COLOR[n.slot]}}>
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
