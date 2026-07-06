import {useMemo, useState} from "react";
import Flag from "../common/Flag.jsx";
import {GREAT_POWERS} from "../../game/sim/newGame.js";

// Nation select: claim the country YOU play; every other power on the roster is
// AI-populated unless toggled out. Search lets you claim any nation on the map.
export default function NewGame({data, onStart, onBack}) {
    const [q, setQ] = useState("");
    const [iso, setIso] = useState("US");
    const [name, setName] = useState("Commander");
    const [ai, setAi] = useState(() => new Set(GREAT_POWERS.filter((i) => i !== "US")));
    const powers = useMemo(() => GREAT_POWERS
        .map((i) => data?.countries.find((c) => c.iso === i))
        .filter(Boolean), [data]);
    const searchList = useMemo(() => {
        if (!q) return [];
        const needle = q.toLowerCase();
        return (data?.countries || []).filter((c) =>
            !GREAT_POWERS.includes(c.iso) && (c.name.toLowerCase().includes(needle) || c.iso.toLowerCase() === needle)).slice(0, 40);
    }, [data, q]);
    const sel = data?.countries.find((c) => c.iso === iso);
    const claim = (i) => {
        setIso(i);
        setAi((s) => {
            const n = new Set(s);
            n.delete(i);
            return n;
        });
    };
    const toggleAi = (i, e) => {
        e.stopPropagation();
        setAi((s) => {
            const n = new Set(s);
            if (n.has(i)) n.delete(i); else n.add(i);
            return n;
        });
    };
    const aiCount = [...ai].filter((i) => i !== iso).length;
    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-newgame gd-card">
                <div className="gd-menu-title sm">New Game</div>
                {!data && <p className="gd-sub">Loading world data…</p>}
                <label className="gd-label">Commander Name</label>
                <input className="gd-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)}/>
                <label className="gd-label mt">Choose Your Nation — Unclaimed Powers Become AI {sel &&
                    <span className="gd-chip subtle"><Flag iso={sel.iso}/> {sel.name}</span>}</label>
                <div className="gd-country-list">
                    {!GREAT_POWERS.includes(iso) && sel && (
                        <button className="gd-country active" onClick={() => claim(sel.iso)}>
                            <span className="gd-flag"><Flag iso={sel.iso}/></span>
                            <span className="gd-country-name">{sel.name}</span>
                            <span className="gd-roster-badge you">You</span>
                        </button>
                    )}
                    {powers.map((c) => (
                        <button key={c.iso} className={`gd-country ${iso === c.iso ? "active" : ""}`}
                                onClick={() => claim(c.iso)}>
                            <span className="gd-flag"><Flag iso={c.iso}/></span>
                            <span className="gd-country-name">{c.name}</span>
                            <span className="gd-country-meta">{c.count}</span>
                            {iso === c.iso
                                ? <span className="gd-roster-badge you">You</span>
                                : <span className={`gd-roster-badge ${ai.has(c.iso) ? "ai" : "out"}`}
                                        onClick={(e) => toggleAi(c.iso, e)}
                                        title={ai.has(c.iso) ? "AI-controlled — click to sit this nation out." : "Sitting out — click to add an AI."}>
                                    {ai.has(c.iso) ? "AI" : "—"}
                                  </span>}
                        </button>
                    ))}
                </div>
                <label className="gd-label mt">Or Search Any Nation</label>
                <input className="gd-input" placeholder="Search countries…" value={q}
                       onChange={(e) => setQ(e.target.value)}/>
                {searchList.length > 0 && (
                    <div className="gd-country-list" style={{maxHeight: "18vh"}}>
                        {searchList.map((c) => (
                            <button key={c.iso} className={`gd-country ${iso === c.iso ? "active" : ""}`}
                                    onClick={() => {
                                        claim(c.iso);
                                        setQ("");
                                    }}>
                                <span className="gd-flag"><Flag iso={c.iso}/></span>
                                <span className="gd-country-name">{c.name}</span>
                                <span className="gd-country-meta">{c.count}</span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="gd-row" style={{marginTop: 14}}>
                    <button className="gd-btn" onClick={onBack}>Back</button>
                    <button className="gd-btn primary" disabled={!sel || aiCount === 0}
                            onClick={() => onStart(iso, name || "Commander", [...ai])}>Start War · vs {aiCount} AI
                    </button>
                </div>
            </div>
        </div>
    );
}
