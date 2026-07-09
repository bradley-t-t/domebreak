import {useState} from "react";
import {menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import {fmtMonthYear, fmtPlaytimeHours, winRatePct} from "../lib/format.js";

export default function StartMenu({
                                      onNew,
                                      onContinue,
                                      onLoad,
                                      onSettings,
                                      onPlay,
                                      canContinue,
                                      profile,
                                      stats,
                                      onSignOut,
                                      onlineCount
                                  }) {
    // Menu is a small two-level tree: the root offers the three top-level modes;
    // Single Player and Multiplayer each open a sub-panel. Settings opens its
    // own screen directly. Section state is local — App's callbacks are unchanged.
    const [section, setSection] = useState(null); // null | "single" | "multi"
    const since = fmtMonthYear(profile?.created_at);
    const total = stats?.total_matches ?? 0;
    const winRate = winRatePct(stats);
    const hours = fmtPlaytimeHours(stats);
    return (
        // Command rail: all menu chrome lives in a slim left-anchored console so the
        // live attract war owns the center of the globe, uncovered.
        <div className="absolute inset-0 z-10 block overflow-hidden p-0">
            <div className="absolute inset-0 -z-1 bg-[radial-gradient(ellipse_120%_100%_at_66%_46%,transparent_46%,rgba(4,6,9,0.42)_82%,rgba(4,6,9,0.72)_100%)]"/>
            <aside className="absolute top-0 left-0 bottom-0 w-96 max-w-[84vw] flex flex-col pt-[46px] pr-[46px] pb-[26px] pl-10 text-left pointer-events-none animate-[dbRailIn_520ms_var(--ease-out-db)_both] motion-reduce:animate-none
                before:content-[''] before:absolute before:inset-0 before:-z-1 before:bg-[linear-gradient(90deg,rgba(7,9,13,0.82)_0%,rgba(7,9,13,0.58)_52%,rgba(7,9,13,0)_100%)] before:backdrop-blur-[9px] before:[backdrop-filter:blur(9px)_saturate(1.1)] before:[mask-image:linear-gradient(90deg,#000_58%,transparent_100%)]
                after:content-[''] after:absolute after:top-5 after:left-5 after:w-4 after:h-4 after:border-t after:border-l after:border-line-soft">
                <div className="mb-[34px]">
                    <div className="flex items-center gap-[7px] mb-4 font-mono text-[10px] tracking-[2.5px] uppercase text-faint">
                        <span className="db-rail-dot w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_7px_var(--danger)] animate-[dbBlink_2.4s_var(--ease-in-out)_infinite] motion-reduce:animate-none"/>
                        System Online
                    </div>
                    <h1 className="text-[46px] tracking-[8px] leading-[0.96] text-dim">
                        DOME<span className="block text-text [text-shadow:var(--glow-gold)] animate-[dbTitleGlow_6s_var(--ease-in-out)_infinite_alternate]">BREAK</span>
                    </h1>
                    <p className="text-dim tracking-[3px] uppercase text-[13px] mt-3 mb-0">Global Missile Command</p>
                </div>
                <nav className="flex flex-col gap-[9px] w-full mx-0 mb-[22px] pointer-events-auto">
                    {section === null && (
                        <>
                            <button className={cn(menuButton({variant: "primary"}), "text-left")} onClick={() => setSection("multi")}>Multiplayer</button>
                            <button className={cn(menuButton(), "text-left")} onClick={() => setSection("single")}>Single Player</button>
                            <button className={cn(menuButton(), "text-left")} onClick={onSettings}>Settings</button>
                        </>
                    )}
                    {section === "multi" && (
                        <>
                            <div className={menuButton({variant: "section"})}>Multiplayer</div>
                            <button className={cn(menuButton({variant: "primary"}), "text-left")} onClick={onPlay}>Play</button>
                            <div className="flex items-center gap-[7px] px-1 py-0.5 font-mono text-[10px] tracking-[1.5px] uppercase text-faint"
                                 aria-label={onlineCount != null ? `${onlineCount} commanders online` : "Commanders online — connecting"}>
                                <span className="w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_7px_var(--danger)] animate-[dbBlink_2.4s_var(--ease-in-out)_infinite] motion-reduce:animate-none"/>
                                {onlineCount != null ? `${onlineCount} Online` : "Connecting…"}
                            </div>
                            <button className={cn(menuButton({variant: "back"}), "text-left")} onClick={() => setSection(null)}>Back</button>
                        </>
                    )}
                    {section === "single" && (
                        <>
                            <div className={menuButton({variant: "section"})}>Single Player</div>
                            {canContinue && <button className={cn(menuButton({variant: "primary"}), "text-left")} onClick={onContinue}>Continue</button>}
                            <button className={cn(menuButton(), "text-left")} onClick={onNew}>New Game</button>
                            <button className={cn(menuButton(), "text-left")} onClick={onLoad}>Load Game</button>
                            <button className={cn(menuButton({variant: "back"}), "text-left")} onClick={() => setSection(null)}>Back</button>
                        </>
                    )}
                </nav>
                <div className="w-full m-0 pointer-events-auto px-4 py-3 border border-line-soft rounded-sm bg-[rgba(16,18,20,0.5)] text-left">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-[13px] tracking-[0.5px] text-text">{profile?.username || "—"}</span>
                        <button className="font-display text-[10px] font-semibold tracking-[1px] uppercase text-faint bg-none border border-line rounded-sm px-2 py-[3px] hover:text-danger hover:border-danger"
                                onClick={onSignOut}
                                aria-label="Sign out of commander account">Sign Out</button>
                    </div>
                    <div className="text-faint text-[11px] tracking-[0.3px] mt-1">{profile ? `Commander since ${since || "—"}` : "—"}</div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2 font-mono text-[11px] text-dim" role="group" aria-label="Career record">
                        <span title="Wins" aria-label={stats ? `${stats.wins} wins` : "Wins — unavailable"}>{stats ? `${stats.wins}W` : "—"}</span>
                        <span title="Losses" aria-label={stats ? `${stats.losses} losses` : "Losses — unavailable"}>{stats ? `${stats.losses}L` : "—"}</span>
                        <span title="Total matches played" aria-label={stats ? `${total} matches played` : "Matches — unavailable"}>{stats ? `${total} Matches` : "—"}</span>
                        <span title="Win rate" aria-label={stats ? `${winRate} percent win rate` : "Win rate — unavailable"}>{stats ? `${winRate}% Win Rate` : "—"}</span>
                        <span title="Total time in command" aria-label={hours != null ? `${hours} hours playtime` : "Playtime — unavailable"}>{hours != null ? `${hours}h Playtime` : "—"}</span>
                    </div>
                </div>
                <div className="mt-auto mb-0 max-w-[300px] text-[10px] leading-[1.6] pointer-events-auto text-faint">A TaylorURL game · made solo by Trenton Taylor · icons game-icons.net (CC BY)
                </div>
            </aside>
        </div>
    );
}
