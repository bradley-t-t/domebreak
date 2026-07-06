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
                                      onMultiplayer,
                                      canContinue,
                                      profile,
                                      stats,
                                      onSignOut
                                  }) {
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
                    {canContinue && <button className="gd-menu-btn primary" onClick={onContinue}>Continue</button>}
                    <button className={`gd-menu-btn ${canContinue ? "" : "primary"}`} onClick={onNew}>New Game</button>
                    <button className="gd-menu-btn" onClick={onMultiplayer}>Multiplayer</button>
                    <button className="gd-menu-btn" onClick={onLoad}>Load Game</button>
                    <button className="gd-menu-btn" onClick={onSettings}>Settings</button>
                </nav>
                <div className="gd-commander-strip">
                    <div className="gd-commander-id">
                        <span className="gd-commander-name">{profile?.username || "—"}</span>
                        <button className="gd-commander-signout" onClick={onSignOut}>Sign Out</button>
                    </div>
                    <div className="gd-commander-since">{profile ? `Commander since ${since || "—"}` : "—"}</div>
                    <div className="gd-commander-stats">
                        <span>{stats ? `${stats.wins}W` : "—"}</span>
                        <span>{stats ? `${stats.losses}L` : "—"}</span>
                        <span>{stats ? `${total} Matches` : "—"}</span>
                        <span>{stats ? `${winRate}% Win Rate` : "—"}</span>
                        <span>{hours != null ? `${hours}h Playtime` : "—"}</span>
                    </div>
                </div>
                <div className="gd-menu-foot">A TaylorURL game · made solo by Trenton Taylor · world map © Open
                    Historia (MIT) · icons game-icons.net (CC BY)
                </div>
            </aside>
        </div>
    );
}
