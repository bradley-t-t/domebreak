import {useMemo, useState} from "react";
import {isoFlag} from "../game/newGame.js";

export default function NewGame({data, settings, onStart, onBack}) {
    const [q, setQ] = useState("");
    const [iso, setIso] = useState("US");
    const [name, setName] = useState("Commander");
    const [opps, setOpps] = useState(settings.opponents);
    const list = useMemo(() => (data?.countries || []).filter((c) =>
        c.name.toLowerCase().includes(q.toLowerCase()) || c.iso.toLowerCase() === q.toLowerCase()), [data, q]);
    const sel = data?.countries.find((c) => c.iso === iso);
    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-newgame gd-card">
                <div className="gd-menu-title sm">New Game</div>
                {!data && <p className="gd-sub">Loading world data…</p>}
                <label className="gd-label">Commander name</label>
                <input className="gd-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)}/>
                <label className="gd-label" style={{marginTop: 12}}>Choose your nation {sel &&
                    <span className="gd-chip subtle">{isoFlag(sel.iso)} {sel.name} · {sel.count} cities</span>}</label>
                <input className="gd-input" placeholder="Search countries…" value={q}
                       onChange={(e) => setQ(e.target.value)}/>
                <div className="gd-country-list">
                    {list.slice(0, 400).map((c) => (
                        <button key={c.iso} className={`gd-country ${iso === c.iso ? "active" : ""}`}
                                onClick={() => setIso(c.iso)}>
                            <span className="gd-flag">{isoFlag(c.iso)}</span>
                            <span className="gd-country-name">{c.name}</span>
                            <span className="gd-country-meta">{c.count}</span>
                        </button>
                    ))}
                </div>
                <label className="gd-label" style={{marginTop: 12}}>AI opponents: {opps}</label>
                <input type="range" min="1" max="12" value={opps} onChange={(e) => setOpps(+e.target.value)}/>
                <div className="gd-row" style={{marginTop: 14}}>
                    <button className="gd-btn" onClick={onBack}>Back</button>
                    <button className="gd-btn primary" disabled={!sel}
                            onClick={() => onStart(iso, name || "Commander", opps)}>Start war
                    </button>
                </div>
            </div>
        </div>
    );
}
