import {useState} from "react";

// "Month Year" from an ISO created_at timestamp, e.g. "July 2026".
const monthYear = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {month: "long", year: "numeric"});
};

export default function StartMenu({
                                      onNew,
                                      onContinue,
                                      onLoad,
                                      onSettings,
                                      onPlay,
                                      canContinue,
                                      profile,
                                      stats,
                                      onSignOut
                                  }) {
    // Menu is a small two-level tree: the root offers the three top-level modes;
    // Single Player and Multiplayer each open a sub-panel. Settings opens its
    // own screen directly. Section state is local — App's callbacks are unchanged.
    const [section, setSection] = useState(null); // null | "single" | "multi"
    const since = monthYear(profile?.created_at);
    const total = stats?.total_matches ?? 0;
    const winRate = total > 0 ? Math.round(((stats?.wins ?? 0) / total) * 100) : 0;
    const hours = stats ? (stats.total_playtime_s / 3600).toFixed(1) : null;
    return (
        // Command rail: all menu chrome lives in a slim left-anchored console so the
        // live attract war owns the center of the globe, uncovered.
        <div className="gd-menu-screen framed">
            <div className="gd-menu-bg"/>
            <aside className="gd-menu-rail">
                <div className="gd-rail-top">
                    <div className="gd-rail-status"><span className="gd-rail-dot"/>System Online</div>
                    <h1 className="gd-menu-title">GOLDEN<span>DOME</span></h1>
                    <p className="gd-menu-tag">Global Missile Command</p>
                </div>
                <nav className="gd-menu-btns">
                    {section === null && (
                        <>
                            <button className="gd-menu-btn primary" onClick={() => setSection("multi")}>Multiplayer</button>
                            <button className="gd-menu-btn" onClick={() => setSection("single")}>Single Player</button>
                            <button className="gd-menu-btn" onClick={onSettings}>Settings</button>
                        </>
                    )}
                    {section === "multi" && (
                        <>
                            <div className="gd-menu-section">Multiplayer</div>
                            <button className="gd-menu-btn primary" onClick={onPlay}>Play</button>
                            <button className="gd-menu-btn back" onClick={() => setSection(null)}>Back</button>
                        </>
                    )}
                    {section === "single" && (
                        <>
                            <div className="gd-menu-section">Single Player</div>
                            {canContinue && <button className="gd-menu-btn primary" onClick={onContinue}>Continue</button>}
                            <button className="gd-menu-btn" onClick={onNew}>New Game</button>
                            <button className="gd-menu-btn" onClick={onLoad}>Load Game</button>
                            <button className="gd-menu-btn back" onClick={() => setSection(null)}>Back</button>
                        </>
                    )}
                </nav>
                <div className="gd-commander-strip">
                    <div className="gd-commander-id">
                        <span className="gd-commander-name">{profile?.username || "—"}</span>
                        <button className="gd-commander-signout" onClick={onSignOut}
                                aria-label="Sign out of commander account">Sign Out</button>
                    </div>
                    <div className="gd-commander-since">{profile ? `Commander since ${since || "—"}` : "—"}</div>
                    <div className="gd-commander-stats" role="group" aria-label="Career record">
                        <span title="Wins" aria-label={stats ? `${stats.wins} wins` : "Wins — unavailable"}>{stats ? `${stats.wins}W` : "—"}</span>
                        <span title="Losses" aria-label={stats ? `${stats.losses} losses` : "Losses — unavailable"}>{stats ? `${stats.losses}L` : "—"}</span>
                        <span title="Total matches played" aria-label={stats ? `${total} matches played` : "Matches — unavailable"}>{stats ? `${total} Matches` : "—"}</span>
                        <span title="Win rate" aria-label={stats ? `${winRate} percent win rate` : "Win rate — unavailable"}>{stats ? `${winRate}% Win Rate` : "—"}</span>
                        <span title="Total time in command" aria-label={hours != null ? `${hours} hours playtime` : "Playtime — unavailable"}>{hours != null ? `${hours}h Playtime` : "—"}</span>
                    </div>
                </div>
                <div className="gd-menu-foot">A TaylorURL game · made solo by Trenton Taylor · world map © Open
                    Historia (MIT) · icons game-icons.net (CC BY)
                </div>
            </aside>
        </div>
    );
}
