import {useMemo, useState} from "react";
import Flag from "../common/Flag.jsx";
import {GREAT_POWERS} from "../../game/sim/newGame.js";

// Nation select: claim the country YOU play; every other power on the roster is
// AI-populated unless toggled out. Search lets you claim any nation on the map.
export default function NewGame({data, onStart, onBack, settings}) {
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
                <label className="gd-label" htmlFor="gd-newgame-name">Commander Name</label>
                <input id="gd-newgame-name" className="gd-input" value={name} maxLength={24}
                       onChange={(e) => setName(e.target.value)}/>
                <label className="gd-label mt" id="gd-newgame-nation-label">Choose Your Nation — Unclaimed Powers
                    Become AI {sel &&
                        <span className="gd-chip subtle"><Flag iso={sel.iso}/> {sel.name}</span>}</label>
                <div className="gd-country-list" role="list" aria-labelledby="gd-newgame-nation-label">
                    {!GREAT_POWERS.includes(iso) && sel && (
                        <button className="gd-country active" role="listitem" onClick={() => claim(sel.iso)}
                                aria-label={`${sel.name} — you`}>
                            <span className="gd-flag"><Flag iso={sel.iso}/></span>
                            <span className="gd-country-name">{sel.name}</span>
                            <span className="gd-roster-badge you">You</span>
                        </button>
                    )}
                    {powers.map((c) => {
                        const isYou = iso === c.iso;
                        const isAi = ai.has(c.iso);
                        const roleLabel = isYou ? "you" : isAi ? "AI-controlled" : "sitting out";
                        return (
                            <button key={c.iso} className={`gd-country ${isYou ? "active" : ""}`}
                                    onClick={() => claim(c.iso)} role="listitem"
                                    aria-label={`${c.name} — ${roleLabel}`}>
                                <span className="gd-flag"><Flag iso={c.iso}/></span>
                                <span className="gd-country-name">{c.name}</span>
                                <span className="gd-country-meta">{c.count}</span>
                                {isYou
                                    ? <span className="gd-roster-badge you">You</span>
                                    : <span className={`gd-roster-badge ${isAi ? "ai" : "out"}`}
                                            role="button" tabIndex={0} aria-pressed={isAi}
                                            aria-label={isAi
                                                ? `${c.name} is AI-controlled — activate to sit this nation out`
                                                : `${c.name} is sitting out — activate to add an AI`}
                                            onClick={(e) => toggleAi(c.iso, e)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    toggleAi(c.iso, e);
                                                }
                                            }}
                                            title={isAi ? "AI-controlled — click to sit this nation out." : "Sitting out — click to add an AI."}>
                                        {isAi ? "AI" : "—"}
                                      </span>}
                            </button>
                        );
                    })}
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
                {sel && aiCount > 0 && (
                    <p className="gd-menu-hint">
                        {aiCount} AI powers · {settings?.speed ?? 1}&times; · {(settings?.globe ?? true) ? "Globe" : "Flat"} view
                    </p>
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
