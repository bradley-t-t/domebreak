import {useMemo, useState} from "react";
import Flag from "../common/Flag.jsx";
import {GREAT_POWERS} from "../../game/sim/newGame.js";

// Nation select: claim the ONE country you command. Every other country on the map
// (all ~222) is a live AI nation, so there is no opponent roster to pick — the great
// powers are just quick-claim shortcuts, and search lets you claim any nation.
export default function NewGame({data, onStart, onBack, settings}) {
    const [q, setQ] = useState("");
    const [iso, setIso] = useState("US");
    const [name, setName] = useState("Commander");
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
    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-newgame gd-card">
                <div className="gd-menu-title sm">New Game</div>
                {!data && <p className="gd-sub">Loading world data…</p>}
                <label className="gd-label" htmlFor="gd-newgame-name">Commander Name</label>
                <input id="gd-newgame-name" className="gd-input" value={name} maxLength={24}
                       onChange={(e) => setName(e.target.value)}/>
                <label className="gd-label mt" id="gd-newgame-nation-label">Choose Your Nation — Every Other Country Is
                    a Live AI {sel &&
                        <span className="gd-chip subtle"><Flag iso={sel.iso}/> {sel.name}</span>}</label>
                <div className="gd-country-list" role="list" aria-labelledby="gd-newgame-nation-label">
                    {!GREAT_POWERS.includes(iso) && sel && (
                        <button className="gd-country active" role="listitem" onClick={() => setIso(sel.iso)}
                                aria-label={`${sel.name} — you`}>
                            <span className="gd-flag"><Flag iso={sel.iso}/></span>
                            <span className="gd-country-name">{sel.name}</span>
                            <span className="gd-roster-badge you">You</span>
                        </button>
                    )}
                    {powers.map((c) => (
                        <button key={c.iso} className={`gd-country ${iso === c.iso ? "active" : ""}`}
                                role="listitem" onClick={() => setIso(c.iso)}
                                aria-label={`${c.name}${iso === c.iso ? " — you" : ""}`}>
                            <span className="gd-flag"><Flag iso={c.iso}/></span>
                            <span className="gd-country-name">{c.name}</span>
                            <span className="gd-country-meta">{c.count}</span>
                            {iso === c.iso && <span className="gd-roster-badge you">You</span>}
                        </button>
                    ))}
                </div>
                <label className="gd-label mt" htmlFor="gd-newgame-search">Or Search Any Nation</label>
                <input id="gd-newgame-search" className="gd-input" placeholder="Search countries…" value={q}
                       onChange={(e) => setQ(e.target.value)}/>
                {searchList.length > 0 && (
                    <div className="gd-country-list" role="list" style={{maxHeight: "18vh"}}>
                        {searchList.map((c) => (
                            <button key={c.iso} className={`gd-country ${iso === c.iso ? "active" : ""}`}
                                    role="listitem" aria-label={`${c.name} — you`}
                                    onClick={() => {
                                        setIso(c.iso);
                                        setQ("");
                                    }}>
                                <span className="gd-flag"><Flag iso={c.iso}/></span>
                                <span className="gd-country-name">{c.name}</span>
                                <span className="gd-country-meta">{c.count}</span>
                            </button>
                        ))}
                    </div>
                )}
                {sel && (
                    <p className="gd-menu-hint">
                        Every other country is a live AI · {settings?.speed ?? 1}&times; · {(settings?.globe ?? true) ? "Globe" : "Flat"} view
                    </p>
                )}
                <div className="gd-row" style={{marginTop: 14}}>
                    <button className="gd-btn" onClick={onBack}>Back</button>
                    <button className="gd-btn primary" disabled={!sel}
                            onClick={() => onStart(iso, name || "Commander")}>Start War
                    </button>
                </div>
            </div>
        </div>
    );
}
