import {useEffect, useMemo, useRef, useState} from "react";
import Flag from "../common/Flag.jsx";
import WorldMap from "../../map/WorldMap.jsx";
import {fetchLobby, leaveLobby, setLobbyIso, setReady, watchLobby} from "../../account/lobby.js";
import {SLOT_COLOR} from "../../game/data/constants.js";
import {fromGid3, toGid3} from "../../game/data/iso3.js";
import {menuScreen, menuBg, menuInner, menuTitle, menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// War-room lobby: a live globe you claim your nation on. The roster (humans and
// server-simulated bots, rendered identically — is_bot is never surfaced) sits
// in a left command rail over the globe; clicking a country picks it as your
// nation, every member's pick is tinted on the sphere, and a Ready button arms
// the launch. There is no host and no manual start — the server auto-launches
// once every member is ready (or on its lobby-ready timeout), per adr-004.

const RAIL_PAD = 360;       // left projection padding so the globe clears the rail

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
    const [picking, setPicking] = useState(false);
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
    const myIso = myMember?.iso || null;
    const humans = members.filter((m) => !m.isBot).length;
    const bots = members.length - humans;
    const countryName = (iso) => data?.countries?.find((c) => c.iso === iso)?.name || iso;

    // Tint every member's claimed nation on the globe, keyed by slot color. A
    // dedicated fill layer sits above the base country fill so it never fights
    // the map's own theming; the paint expression is rebuilt as picks change.
    useEffect(() => {
        const m = mapRef.current;
        if (!m || !m.getLayer?.("lobby-pick")) return;
        const picks = {};
        for (const mem of members) {
            const gid = toGid3(mem.iso);
            if (gid) picks[gid] = SLOT_COLOR[mem.slot] || "#8ecae6"; // dedupe by GID_0 (match labels must be unique)
        }
        const pairs = Object.entries(picks).flat();
        const expr = pairs.length ? ["match", ["get", "GID_0"], ...pairs, "rgba(0,0,0,0)"] : "rgba(0,0,0,0)";
        try {
            m.setPaintProperty("lobby-pick", "fill-color", expr);
        } catch { /* style tearing down */
        }
    }, [members, mapReady]);

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
                    paint: {"fill-color": "rgba(0,0,0,0)", "fill-opacity": 0.55},
                }, "country-line");
            }
        } catch { /* map tearing down */
        }
        setMapReady((x) => x + 1);
    };

    const onMapClick = (e) => {
        const m = mapRef.current;
        const feat = e.features?.find((f) => f.layer?.id === "country-fill")
            || (m ? m.queryRenderedFeatures(e.point, {layers: ["country-fill"]})[0] : null);
        const iso = fromGid3(feat?.properties?.GID_0);
        if (!iso || !data?.countries?.some((c) => c.iso === iso)) return;
        if (iso === myIso || picking) return;
        setPicking(true);
        Promise.resolve(setLobbyIso(iso)).finally(() => setPicking(false));
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
        setReady(!myMember.ready);
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

    const ready = !!myMember?.ready;

    return (
        <div className="absolute inset-0 z-10 block overflow-hidden p-0">
            <div className="absolute inset-0 z-0 pointer-events-auto">
                <WorldMap globe interactiveLayerIds={["country-fill"]} cursor="pointer"
                          onMap={onMap} onMapClick={onMapClick}/>
            </div>
            <div className="absolute inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_120%_100%_at_66%_46%,transparent_46%,rgba(4,6,9,0.42)_82%,rgba(4,6,9,0.72)_100%)]" aria-hidden="true"/>

            <aside className="absolute top-0 left-0 bottom-0 z-[2] w-96 max-w-[84vw] flex flex-col pt-[46px] pr-[46px] pb-[22px] pl-10 text-left pointer-events-none animate-[gdRailIn_520ms_var(--ease-out-gd)_both] motion-reduce:animate-none
                before:content-[''] before:absolute before:inset-0 before:-z-1 before:bg-[linear-gradient(90deg,rgba(7,9,13,0.82)_0%,rgba(7,9,13,0.58)_52%,rgba(7,9,13,0)_100%)] before:backdrop-blur-[9px] before:[backdrop-filter:blur(9px)_saturate(1.1)] before:[mask-image:linear-gradient(90deg,#000_58%,transparent_100%)]
                after:content-[''] after:absolute after:top-5 after:left-5 after:w-4 after:h-4 after:border-t after:border-l after:border-line-soft">
                <div className="mb-[34px]">
                    <div className="flex items-center gap-[7px] mb-4 font-mono text-[10px] tracking-[2.5px] uppercase text-faint">
                        <span className="gd-rail-dot w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_7px_var(--danger)] animate-[gdBlink_2.4s_var(--ease-in-out)_infinite] motion-reduce:animate-none"/>
                        Matchmaking · War Room
                    </div>
                    <h1 className={menuTitle({sm: true})}>WAR<span className="text-text [text-shadow:var(--glow-gold)] animate-[gdTitleGlow_6s_var(--ease-in-out)_infinite_alternate]">ROOM</span></h1>
                    <p className="text-dim tracking-[3px] uppercase text-[13px] mt-3 mb-0">{humans} commander{humans !== 1 ? "s" : ""} · {bots} joining</p>
                </div>

                {revertErr && <p className="text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm py-2 px-3 text-[12.5px] mt-2.5 pointer-events-auto">War server unreachable — try again.</p>}

                <div className="pointer-events-none flex flex-col gap-[5px] mb-4">
                    <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-faint">Your Nation</span>
                    <span className={cn(
                        "flex items-center gap-[9px] font-sans text-[19px] font-bold text-text [&_.gd-flag]:w-[26px] [&_.gd-flag]:rounded-[3px] [&_img]:w-[26px] [&_img]:rounded-[3px]",
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
                        return (
                            <div key={m.userId ?? `bot-${m.slot}`}
                                 className={cn(
                                     "flex items-center gap-[9px] py-2 px-[11px] rounded-[var(--radius)] border border-line-soft bg-[rgba(9,11,15,0.5)] [&_.gd-flag]:w-[22px] [&_.gd-flag]:rounded-[2px] [&_.gd-flag]:shrink-0 [&_img]:w-[22px] [&_img]:rounded-[2px] [&_img]:shrink-0",
                                     m.ready && "border-gold-line",
                                     own && "border-gold-line bg-[rgba(9,11,15,0.72)]"
                                 )}
                                 role="listitem"
                                 aria-label={`${m.username || "Commander"}${own ? " (you)" : ""} — ${m.iso || "no nation"} — ${m.ready ? "ready" : "not ready"}`}>
                                <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{background: SLOT_COLOR[m.slot]}}/>
                                <Flag iso={m.iso}/>
                                <span className="flex-1 text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{m.username || "Commander"}{own ? " (You)" : ""}</span>
                                <span className={cn("font-mono text-[10px] tracking-[1px] uppercase text-faint shrink-0", m.ready && "text-gold")}>{m.ready ? "Ready" : "…"}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="pointer-events-auto flex flex-col gap-[9px]">
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

                <p className="text-left mt-3.5 max-w-[300px] text-faint text-xs pointer-events-none">
                    Claim a nation on the globe, then ready up. War begins the moment every commander is ready.
                </p>
            </aside>
        </div>
    );
}
