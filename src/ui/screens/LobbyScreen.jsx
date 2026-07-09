import {useEffect, useMemo, useRef, useState} from "react";
import Flag from "../common/Flag.jsx";
import WorldMap from "../../map/WorldMap.jsx";
import {fetchLobby, leaveLobby, setLobbyIso, setLobbyRules, setReady, watchLobby} from "../../account/lobby.js";
import {SLOT_COLOR} from "../../game/data/constants.js";
import {fromGid3, toGid3} from "../../game/data/iso3.js";
import {DEFAULT_RULES, normalizeRules} from "../../game/sim/gameRules.js";
import GameRulesForm from "./GameRulesForm.jsx";
import {menuScreen, menuBg, menuInner, menuTitle, menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// War-room lobby: a live globe you claim your nation on. The roster (real
// players only — no bots) sits in a left command rail over the globe; clicking a
// country picks it as your nation, every member's pick is tinted on the sphere,
// and a Ready button arms the launch. There is no host and no manual start — the
// server auto-launches once every member is ready (or on its lobby-ready
// timeout). Each player claims their own nation inside the full
// living world (every other country is world AI, as in single player).

const RAIL_PAD = 360;       // left projection padding so the globe clears the rail
const MINE_COLOR = "#f4c02a"; // vivid gold for YOUR own claimed nation — unmistakable vs the grey map

// Average lng/lat of a nation's cities — a good-enough centroid to fly the globe
// to when the player claims that country.
function centroid(data, iso) {
    const arr = data?.cities?.[iso];
    if (!arr?.length) return null;
    let lng = 0, lat = 0;
    for (const c of arr) {
        lng += c.lng;
        lat += c.lat;
    }
    return [lng / arr.length, lat / arr.length];
}

export default function LobbyScreen({lobbyId, me, connecting, onLaunch, onLeft, data}) {
    // undefined = initial fetch still in flight, null = fetched and gone/closed,
    // object = loaded. Treating the initial `undefined` as "gone" would fire
    // onLeft() on mount — before fetchLobby() resolves — and bounce the player
    // straight back to the menu the instant they match.
    const [lobby, setLobby] = useState(undefined);
    const [revertErr, setRevertErr] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Optimistic nation pick: reflected instantly on the globe/label/camera the
    // moment you click, so selection never waits on the set-iso round-trip and its
    // realtime echo. Cleared once the server's lobby row catches up (or on error).
    const [optimisticIso, setOptimisticIso] = useState(null);
    // Optimistic ready toggle: the button reflects the intent the instant you click
    // instead of waiting for the ready write + its realtime echo (which made a
    // working click look like nothing happened). null = follow the server row.
    const [readyOpt, setReadyOpt] = useState(null);
    const mapRef = useRef(null);
    const [mapReady, setMapReady] = useState(0);
    // Guards so realtime's repeated callbacks can never double-fire the
    // handoff to the game client or the return-to-menu callback.
    const launchedRef = useRef(false);
    const leftRef = useRef(false);
    const prevStatusRef = useRef(null);

    useEffect(() => {
        const refresh = () => fetchLobby(lobbyId).then((l) => setLobby(l ?? null));
        refresh();
        return watchLobby(lobbyId, refresh);
    }, [lobbyId]);

    useEffect(() => {
        if (lobby === undefined) return; // still loading — not "gone", don't bounce
        if (!lobby) {
            if (!leftRef.current) {
                leftRef.current = true;
                onLeft?.();
            }
            return;
        }
        if (lobby.status === "closed" && !leftRef.current) {
            leftRef.current = true;
            onLeft?.();
            return;
        }
        // Backend couldn't reach a claim in time and reported failure.
        if (prevStatusRef.current === "starting" && lobby.status !== "starting" && lobby.status !== "active") {
            setRevertErr(true);
        }
        prevStatusRef.current = lobby.status;

        if (lobby.status === "active" && lobby.match_id && lobby.server_url && !launchedRef.current) {
            launchedRef.current = true;
            onLaunch?.(lobby);
        }
    }, [lobby, onLaunch, onLeft]);

    const members = useMemo(() => (lobby?.members ? [...lobby.members].sort((a, b) => a.slot - b.slot) : []), [lobby]);
    const myMember = members.find((m) => me?.id === m.userId);
    const myIso = optimisticIso || myMember?.iso || null;

    // Drop the optimistic pick once the authoritative lobby row reflects it.
    useEffect(() => {
        if (optimisticIso && myMember?.iso === optimisticIso) setOptimisticIso(null);
    }, [myMember?.iso, optimisticIso]);
    // Drop the optimistic ready state once the server row agrees.
    useEffect(() => {
        if (readyOpt != null && myMember && !!myMember.ready === readyOpt) setReadyOpt(null);
    }, [myMember?.ready, myMember, readyOpt]);
    const humans = members.length; // real players only — no bots
    const countryName = (iso) => data?.countries?.find((c) => c.iso === iso)?.name || iso;

    // My ready state (optimistic-aware) and the ready tally. My own count reflects
    // the instant optimistic value so the meter never lags a click.
    const ready = readyOpt ?? !!myMember?.ready;
    const readyCount = members.filter((m) => (me?.id === m.userId ? ready : !!m.ready)).length;
    const allReady = members.length > 0 && readyCount === members.length;
    const starting = lobby?.status === "starting" || lobby?.status === "active";
    const statusLine = starting ? "All commanders ready — deploying to the theater…"
        : allReady ? "Everyone ready — launching…"
            : !myIso ? "Claim your nation to continue."
                : ready ? `Standing by — waiting on ${members.length - readyCount} more.`
                    : "Ready up when you're set.";

    // Live activity feed: diff the roster each realtime update into human-readable
    // status lines (joins, nation picks, ready toggles, launch), newest last.
    const prevMembersRef = useRef(null);
    const feedIdRef = useRef(0);
    const [feed, setFeed] = useState([]);
    useEffect(() => {
        const prev = prevMembersRef.current;
        const snap = {};
        const msgs = [];
        for (const m of members) {
            const key = m.userId ?? `s${m.slot}`;
            snap[key] = {ready: !!m.ready, iso: m.iso || null, name: m.username || "Commander"};
            const own = me?.id === m.userId;
            const who = own ? "You" : (m.username || "Commander");
            const p = prev?.[key];
            if (!prev) continue; // seed silently on first load — no backlog of "joined"
            if (!p) msgs.push(`${who} joined the war room`);
            else {
                if (snap[key].iso && snap[key].iso !== p.iso) msgs.push(`${who} chose ${countryName(snap[key].iso)}`);
                if (snap[key].ready && !p.ready) msgs.push(`${who} ${own ? "are" : "is"} ready`);
                if (!snap[key].ready && p.ready) msgs.push(`${who} stood down`);
            }
        }
        if (prev) for (const key in prev) if (!(key in snap)) msgs.push(`${prev[key].name} left the war room`);
        prevMembersRef.current = snap;
        if (msgs.length) setFeed((f) => [...f, ...msgs.map((t) => ({id: ++feedIdRef.current, t}))].slice(-6));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    // A launch line the moment the server flips the lobby to starting/active.
    useEffect(() => {
        if (starting) setFeed((f) => [...f, {id: ++feedIdRef.current, t: "Deploying — establishing theater command…"}].slice(-6));
    }, [starting]);

    // Tint every member's claimed nation on the globe, keyed by slot color. A
    // dedicated fill layer sits above the base country fill so it never fights
    // the map's own theming; the paint expression is rebuilt as picks change.
    useEffect(() => {
        const m = mapRef.current;
        // Bail before touching the map unless its style is fully live. Calling
        // getLayer/setPaintProperty on a map whose style is still loading OR being
        // torn down (the lobby -> match handoff) throws inside MapLibre
        // ("Cannot read properties of undefined (reading 'getLayer')") — and since
        // LobbyScreen isn't inside an error boundary, that uncaught throw blanks the
        // whole app. Guard on isStyleLoaded AND wrap so it can never escape.
        if (!m || !m.isStyleLoaded?.()) return;
        try {
            if (!m.getLayer("lobby-pick")) return;
            const picks = {};
            for (const mem of members) {
                const gid = toGid3(mem.iso);
                if (!gid) continue; // dedupe by GID_0 (match labels must be unique)
                // YOUR nation glows vivid gold; opponents keep their slot color.
                picks[gid] = me?.id === mem.userId ? MINE_COLOR : (SLOT_COLOR[mem.slot] || "#8ecae6");
            }
            // Paint the optimistic pick immediately, before the server echo lands.
            if (optimisticIso && myMember) {
                const gid = toGid3(optimisticIso);
                if (gid) picks[gid] = MINE_COLOR;
            }
            const pairs = Object.entries(picks).flat();
            const expr = pairs.length ? ["match", ["get", "GID_0"], ...pairs, "rgba(0,0,0,0)"] : "rgba(0,0,0,0)";
            m.setPaintProperty("lobby-pick", "fill-color", expr);
            // Bright outline around every claimed nation for an unmistakable selection.
            if (m.getLayer("lobby-pick-line")) m.setPaintProperty("lobby-pick-line", "line-color", expr);
        } catch { /* style not ready / tearing down */
        }
    }, [members, mapReady, optimisticIso, myMember, me?.id]);

    // Fly the globe to the nation the local player just claimed.
    useEffect(() => {
        const m = mapRef.current;
        if (!m || !myIso) return;
        const c = centroid(data, myIso);
        if (!c) return;
        try {
            m.easeTo({center: c, zoom: 2.35, padding: {top: 0, right: 0, bottom: 0, left: RAIL_PAD}, duration: 900});
        } catch { /* tearing down */
        }
    }, [myIso, data, mapReady]);

    const onMap = (m) => {
        mapRef.current = m;
        try {
            m.resize();
            const c = centroid(data, myIso) || [22, 26];
            m.jumpTo({center: c, zoom: myIso ? 2.35 : 1.85, padding: {top: 0, right: 0, bottom: 0, left: RAIL_PAD}});
            if (!m.getLayer("lobby-pick")) {
                m.addLayer({
                    id: "lobby-pick", type: "fill", source: "countries", "source-layer": "countries",
                    paint: {"fill-color": "rgba(0,0,0,0)", "fill-opacity": 0.72},
                }, "country-line");
                // A bright outline on top of the fill makes a claimed nation pop.
                m.addLayer({
                    id: "lobby-pick-line", type: "line", source: "countries", "source-layer": "countries",
                    paint: {"line-color": "rgba(0,0,0,0)", "line-width": 2.2, "line-opacity": 0.95},
                }, "country-line");
            }
        } catch { /* map tearing down */
        }
        setMapReady((x) => x + 1);
    };

    const onMapClick = (e) => {
        const m = mapRef.current;
        if (!m) return;
        // Forgiving hit test: the exact click point first, then a small box around
        // it — so a near-miss on a small country (or the curved globe) still selects
        // instead of doing nothing and making the player click over and over.
        let feat = e.features?.find((f) => f.layer?.id === "country-fill")
            || m.queryRenderedFeatures(e.point, {layers: ["country-fill"]})[0];
        if (!feat) {
            const r = 16, p = e.point;
            feat = m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], {layers: ["country-fill"]})[0];
        }
        const iso = fromGid3(feat?.properties?.GID_0);
        if (!iso || !data?.countries?.some((c) => c.iso === iso)) return;
        if (iso === myIso) return;
        // Instant local feedback; the write and its realtime echo catch up after.
        setOptimisticIso(iso);
        Promise.resolve(setLobbyIso(iso)).catch(() => { /* realtime refetch will resync */ });
    };

    const doLeave = async () => {
        if (leaving) return;
        setLeaving(true);
        await leaveLobby();
        setLeaving(false);
        onLeft?.();
    };

    const toggleReady = () => {
        if (!myIso || !myMember) return;
        const next = readyOpt ?? !myMember.ready;
        setReadyOpt(next);
        Promise.resolve(setReady(next))
            .then((r) => { if (r?.error) setReadyOpt(null); })
            .catch(() => setReadyOpt(null));
    };

    // Shared match rules — any seated member may adjust; the write propagates
    // to everyone via the lobby row's realtime update. The panel starts
    // collapsed so the roster/globe stays the focus; toggling opens the form.
    const [rulesOpen, setRulesOpen] = useState(false);
    // Optimistic overlay so a slider drag reflects instantly instead of waiting
    // on the round-trip. Cleared once the lobby row echoes back.
    const [rulesOpt, setRulesOpt] = useState(null);
    const lobbyRules = useMemo(() => normalizeRules(lobby?.rules ?? DEFAULT_RULES), [lobby?.rules]);
    const rules = rulesOpt ?? lobbyRules;
    useEffect(() => {
        if (!rulesOpt) return;
        const keys = Object.keys(rulesOpt);
        if (keys.every((k) => Math.abs((lobbyRules[k] ?? 0) - rulesOpt[k]) < 1e-6)) setRulesOpt(null);
    }, [lobbyRules, rulesOpt]);
    const onRulesChange = (next) => {
        setRulesOpt(next);
        Promise.resolve(setLobbyRules(next))
            .then((r) => { if (r?.error) setRulesOpt(null); })
            .catch(() => setRulesOpt(null));
    };

    if (lobby === undefined) {
        return (
            <div className={menuScreen()}>
                <div className={menuBg()}/>
                <div className={menuInner()}>
                    <h1 className={menuTitle({sm: true})}>Entering War Room…</h1>
                </div>
            </div>
        );
    }
    if (!lobby) return null;

    if (connecting) {
        return (
            <div className={menuScreen()}>
                <div className={menuBg()}/>
                <div className={menuInner()}>
                    <h1 className={menuTitle({sm: true})}>Contacting War Server…</h1>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-10 block overflow-hidden p-0">
            <div className="absolute inset-0 z-0 pointer-events-auto">
                <WorldMap globe interactiveLayerIds={["country-fill"]} cursor="pointer"
                          onMap={onMap} onMapClick={onMapClick}/>
            </div>
            <div className="absolute inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_120%_100%_at_66%_46%,transparent_46%,rgba(4,6,9,0.42)_82%,rgba(4,6,9,0.72)_100%)]" aria-hidden="true"/>

            <aside className="absolute top-0 left-0 bottom-0 z-[2] w-96 max-w-[84vw] flex flex-col pt-[46px] pr-[46px] pb-[22px] pl-10 text-left pointer-events-none animate-[dbRailIn_520ms_var(--ease-out-db)_both] motion-reduce:animate-none
                before:content-[''] before:absolute before:inset-0 before:-z-1 before:bg-[linear-gradient(90deg,rgba(7,9,13,0.82)_0%,rgba(7,9,13,0.58)_52%,rgba(7,9,13,0)_100%)] before:backdrop-blur-[9px] before:[backdrop-filter:blur(9px)_saturate(1.1)] before:[mask-image:linear-gradient(90deg,#000_58%,transparent_100%)]
                after:content-[''] after:absolute after:top-5 after:left-5 after:w-4 after:h-4 after:border-t after:border-l after:border-line-soft">
                <div className="mb-[34px]">
                    <div className="flex items-center gap-[7px] mb-4 font-mono text-[10px] tracking-[2.5px] uppercase text-faint">
                        <span className="db-rail-dot w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_7px_var(--danger)] animate-[dbBlink_2.4s_var(--ease-in-out)_infinite] motion-reduce:animate-none"/>
                        Matchmaking · War Room
                    </div>
                    <h1 className={menuTitle({sm: true})}>WAR<span className="text-text [text-shadow:var(--glow-gold)] animate-[dbTitleGlow_6s_var(--ease-in-out)_infinite_alternate]">ROOM</span></h1>
                    <p className="text-dim tracking-[3px] uppercase text-[13px] mt-3 mb-0">{humans} commander{humans !== 1 ? "s" : ""} in the war room</p>
                </div>

                {revertErr && <p className="text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm py-2 px-3 text-[12.5px] mt-2.5 pointer-events-auto">War server unreachable — try again.</p>}

                <div className="pointer-events-none flex flex-col gap-[5px] mb-4">
                    <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-faint">Your Nation</span>
                    <span className={cn(
                        "flex items-center gap-[9px] font-sans text-[19px] font-bold text-text [&_.db-flag]:w-[26px] [&_.db-flag]:rounded-[3px] [&_img]:w-[26px] [&_img]:rounded-[3px]",
                        !myIso && "text-[13px] font-medium text-faint"
                    )}>
                        {myIso
                            ? <><Flag iso={myIso}/> {countryName(myIso)}</>
                            : "Click a country on the globe →"}
                    </span>
                </div>

                <div className="pointer-events-none flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto mb-4 pr-1" role="list" aria-label="War room roster">
                    {members.map((m) => {
                        const own = me?.id === m.userId;
                        const r = own ? ready : !!m.ready; // own row reflects the optimistic toggle
                        return (
                            <div key={m.userId ?? `p-${m.slot}`}
                                 className={cn(
                                     "flex items-center gap-[9px] py-2 px-[11px] rounded-[var(--radius)] border border-line-soft bg-[rgba(9,11,15,0.5)] transition-colors [&_.db-flag]:w-[22px] [&_.db-flag]:rounded-[2px] [&_.db-flag]:shrink-0 [&_img]:w-[22px] [&_img]:rounded-[2px] [&_img]:shrink-0",
                                     r && "border-gold-line bg-[rgba(244,192,42,0.08)]",
                                     own && !r && "border-gold-line bg-[rgba(9,11,15,0.72)]"
                                 )}
                                 role="listitem"
                                 aria-label={`${m.username || "Commander"}${own ? " (you)" : ""} — ${m.iso || "no nation"} — ${r ? "ready" : "not ready"}`}>
                                <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{background: own ? MINE_COLOR : SLOT_COLOR[m.slot]}}/>
                                <Flag iso={m.iso}/>
                                <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{m.username || "Commander"}{own ? " (You)" : ""}</span>
                                <span className={cn("font-mono text-[10px] tracking-[1px] uppercase shrink-0", r ? "text-gold" : "text-faint")}>{r ? "✓ Ready" : "Waiting"}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Ready tally + your-ready state + live activity feed. */}
                <div className="pointer-events-none mb-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-faint">Ready</span>
                        <span className={cn("font-mono text-[12px] tracking-[1px]", allReady ? "text-gold" : "text-dim")}>{readyCount} / {members.length}</span>
                    </div>
                    <div className="flex gap-1" aria-hidden="true">
                        {members.map((m) => {
                            const r = me?.id === m.userId ? ready : !!m.ready;
                            return <div key={m.userId ?? m.slot}
                                        className={cn("h-[5px] flex-1 rounded-full transition-colors duration-200", r ? "bg-gold shadow-[0_0_6px_var(--glow-gold,rgba(244,192,42,0.7))]" : "bg-[rgba(255,255,255,0.12)]")}/>;
                        })}
                    </div>
                    <span className={cn("self-start font-mono text-[10px] tracking-[1.5px] uppercase px-2 py-1 rounded-sm border transition-colors",
                        ready ? "text-gold border-gold-line bg-[rgba(244,192,42,0.1)]" : "text-faint border-line")}>
                        {ready ? "✓ You are ready" : "You are not ready"}
                    </span>
                    <span className={cn("text-[12px] leading-snug", starting || allReady ? "text-gold" : "text-dim")} role="status" aria-live="polite">{statusLine}</span>
                    {feed.length > 0 && (
                        <div className="db-scroll max-h-[84px] overflow-y-auto flex flex-col gap-[2px] font-mono text-[11px] text-faint pr-1" aria-live="polite" aria-label="Lobby activity">
                            {feed.map((f) => <span key={f.id} className="animate-[dbRowIn_200ms_var(--ease-out)_both]">&rsaquo; {f.t}</span>)}
                        </div>
                    )}
                </div>

                <div className="pointer-events-auto flex flex-col gap-[9px]">
                    <button
                        type="button"
                        className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-sm border border-line-soft bg-[rgba(9,11,15,0.5)] text-left transition-colors hover:border-line",
                            rulesOpen && "border-gold-line bg-[rgba(244,192,42,0.06)]"
                        )}
                        onClick={() => setRulesOpen((o) => !o)}
                        aria-expanded={rulesOpen}
                        aria-controls="db-lobby-rules"
                    >
                        <span className="flex flex-col">
                            <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-faint">Game Rules</span>
                            <span className="text-[12px] text-dim">
                                {rules.activeCount} nations · {rules.startPoints} pts · {Math.round(rules.dominationPopFrac * 100)}% dom · {rules.playerGraceSec}s grace
                            </span>
                        </span>
                        <span className={cn("font-mono text-[11px] text-dim transition-transform", rulesOpen && "rotate-90")}>&rsaquo;</span>
                    </button>
                    {rulesOpen && (
                        <div id="db-lobby-rules"
                             className="max-h-[46vh] overflow-y-auto rounded-sm border border-line-soft bg-[rgba(9,11,15,0.6)] p-3">
                            <GameRulesForm mode="mp" rules={rules} onChange={onRulesChange}/>
                            <p className="mt-2 font-mono text-[10px] text-faint tracking-[1px] uppercase">Shared with the whole war room.</p>
                        </div>
                    )}
                    <button className={cn(menuButton({variant: "primary"}), "w-full text-center disabled:opacity-50", ready && "bg-gold text-gold-contrast border-gold-line")}
                            disabled={!myIso} onClick={toggleReady}
                            aria-pressed={ready}
                            title={!myIso ? "Choose a nation on the globe first" : ready ? "Cancel ready" : "Ready up"}>
                        {ready ? "✓ Ready — Stand By" : "Ready Up"}
                    </button>
                    <button className={cn(menuButton({variant: "back"}), "w-full text-center")} disabled={leaving} onClick={doLeave}>
                        {leaving ? "Leaving…" : "Leave"}
                    </button>
                </div>
            </aside>
        </div>
    );
}
