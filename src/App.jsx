import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import StartMenu from "./ui/screens/StartMenu.jsx";
import NewGame from "./ui/screens/NewGame.jsx";
import NewGameRules from "./ui/screens/NewGameRules.jsx";
import LiveGame from "./ui/live/LiveGame.jsx";
import ErrorBoundary from "./ui/common/ErrorBoundary.jsx";
import PauseMenu from "./ui/screens/PauseMenu.jsx";
import SettingsPanel from "./ui/screens/SettingsPanel.jsx";
import SaveLoadPanel from "./ui/screens/SaveLoadPanel.jsx";
import LoginScreen from "./ui/screens/LoginScreen.jsx";
import SplashSequence from "./ui/screens/SplashSequence.jsx";
import AttractSim from "./ui/live/AttractSim.jsx";
import {createWorld} from "./game/engine.js";
import {buildSetup, loadGameData} from "./game/sim/newGame.js";
import {DEFAULT_RULES, normalizeRules} from "./game/sim/gameRules.js";
import {loadSettings, saveSettings} from "./game/platform/settings.js";
import {resolveKeys} from "./game/platform/keybindings.js";
import {applyAudioSettings, initAudio} from "./game/platform/audio.js";
import {AUTOSAVE, hasContinue, listSaves, loadGame, saveGame} from "./game/platform/saves.js";
import {fetchAvatar, fetchProfile, fetchStats, getSession, onAuth, reportMatch, setAvatar, signOut, touch} from "./account/api.js";
import {connectMatch} from "./net/gameClient.js";
import {supabase} from "./account/client.js";
import MeBadge from "./ui/common/MeBadge.jsx";
import TitleBarDrag from "./ui/common/TitleBarDrag.jsx";
import SearchingScreen from "./ui/screens/SearchingScreen.jsx";
import LobbyScreen from "./ui/screens/LobbyScreen.jsx";
import NetErrorOverlay from "./ui/screens/NetErrorOverlay.jsx";
import {usePresence} from "./ui/hooks/usePresence.js";
import {useParty} from "./ui/hooks/useParty.js";

// DEV-ONLY login-gate bypass for automated local UI testing (single-player). Hard
// gated on import.meta.env.DEV so `vite build` (Electron/production) dead-code
// strips it entirely; opt in per browser with localStorage.setItem('db-dev-noauth','1')
// then reload. Online play still needs a real session (there is no fake JWT).
const DEV_NOAUTH = import.meta.env.DEV
    && typeof localStorage !== "undefined" && localStorage.getItem("db-dev-noauth") === "1";

export default function App() {
    const [screen, setScreen] = useState("menu");
    const [overlay, setOverlay] = useState(null);
    const [saveMode, setSaveMode] = useState("save");
    const [world, setWorld] = useState(null);
    const [session, setSession] = useState(0);
    const [belligerents, setBelligerents] = useState([]);
    const [settings, setSettings] = useState(loadSettings());
    const [globe, setGlobe] = useState(loadSettings().globe);
    const [data, setData] = useState(null);
    const [profile, setProfile] = useState({name: "Commander", iso: "US"});
    const [splashDone, setSplashDone] = useState(false);
    // Nation chosen on NewGame, carried into the rules step. Cleared when the
    // rules step is exited (back or Start War).
    const [newGameIso, setNewGameIso] = useState(null);
    // Last-authored SP rules — seeded from settings, remembered across the
    // menu so the next New Game doesn't start from cold defaults.
    const [spRules, setSpRules] = useState(() => normalizeRules(loadSettings().rules ?? DEFAULT_RULES));
    // Online play: current lobby room and the live match connection.
    const [lobbyId, setLobbyId] = useState(null);
    // True while the search screen is watching a party's public queue (the party
    // is already enrolled by db-party, so the search screen must not re-enqueue).
    const [partySearch, setPartySearch] = useState(false);
    const [netClient, setNetClient] = useState(null);
    const [netStatus, setNetStatus] = useState(null); // null | "connecting" | "failed" | "lost"
    // Detail dump surfaced by NetErrorOverlay when netStatus is "failed" or "lost"
    // — the multi-line technical trace from connectMatch (URLs tried, ws close
    // code, server error, matchId) so a player can Copy it into a bug report
    // instead of getting silently punted to the menu. Cleared when the overlay
    // dismisses.
    const [netError, setNetError] = useState(null);
    // The lobby the last join attempt targeted — held so the failure overlay's
    // Retry button can re-invoke joinMatch with the same match_id + server_url.
    const retryLobbyRef = useRef(null);
    // Honor both the OS motion preference and the in-game toggle.
    const reduceMotion = settings.reduceMotion ||
        (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    // Resolved control bindings (saved overrides filled in with defaults). Memoized
    // by settings.keys so it stays referentially stable across game-tick re-renders,
    // and LiveGame's key listeners only re-subscribe when a binding actually changes.
    const keys = useMemo(() => resolveKeys(settings.keys), [settings.keys]);

    // Account/auth surface — named distinctly from `profile` above (the
    // in-game nation profile) to avoid collision.
    const [authStatus, setAuthStatus] = useState("loading"); // loading | signedOut | signedIn
    const [accountProfile, setAccountProfile] = useState(null);
    const [accountStats, setAccountStats] = useState(null);
    // Per-session bookkeeping for match reporting: when the current game
    // started (wall clock) and whether it's already been reported once —
    // guards win/loss/quit from ever double-firing for one game session.
    const wallStartedAtRef = useRef(null);
    const reportedRef = useRef(false);
    // Live presence: head-count for the Multiplayer menu + a per-user map so the
    // Friends panel can show who's online and what they're doing. My own activity
    // is broadcast so friends see me as In menus / Single-player / Multiplayer /
    // Lobby / Searching. Only joins the presence channel once signed in.
    const presenceActivity = authStatus !== "signedIn" ? null
        : screen === "playing" ? (netClient ? "multi" : "single")
            : screen === "lobby" ? "lobby"
                : screen === "searching" ? "searching"
                    : "menu";
    // The signed-in player's party (create / join / launch), kept live. Its
    // open+joinable summary rides along in presence so friends can see and join.
    const partyHook = useParty(authStatus === "signedIn");
    const {party, members: partyMembers} = partyHook;
    const partyInfo = party && party.status === "open" ? {
        id: party.id, join_mode: party.join_mode, seats: partyMembers.length, max: party.max_seats,
        leaderName: partyMembers.find((m) => m.is_leader)?.username || null,
    } : null;
    const {count: onlineCount, byId: presence} = usePresence(authStatus === "signedIn", presenceActivity, partyInfo);

    // When the leader launches, every member's party flips to 'launching'; route
    // each client into the match — straight to the lobby for a private launch, or
    // the (already-enqueued) search screen for a public queue.
    useEffect(() => {
        if (!party || party.status !== "launching") return;
        if (screen === "playing" || screen === "lobby") return;
        if (party.lobby_id) {
            setLobbyId(party.lobby_id);
            setScreen("lobby");
        } else {
            setPartySearch(true);
            setScreen("searching");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [party?.status, party?.lobby_id]);

    useEffect(() => {
        loadGameData().then(setData).catch(() => {
        });
        initAudio(loadSettings());
    }, []);

    // Session bootstrap + subscription. getSession() covers the already-signed-in
    // reload case; onAuth covers sign-in/sign-out happening while mounted.
    useEffect(() => {
        if (DEV_NOAUTH) {
            setAuthStatus("signedIn");
            setAccountProfile({username: "DevTester", iso: "US", created_at: new Date().toISOString()});
            return;
        }
        let alive = true;
        getSession().then((s) => {
            if (alive) setAuthStatus(s ? "signedIn" : "signedOut");
        });
        const unsub = onAuth((s) => {
            setAuthStatus(s ? "signedIn" : "signedOut");
            if (!s) {
                setAccountProfile(null);
                setAccountStats(null);
            }
        });
        return () => {
            alive = false;
            unsub();
        };
    }, []);

    // Fresh profile/stats on every sign-in, and a stats refresh whenever the
    // player lands back on the menu (so post-game numbers are current).
    useEffect(() => {
        if (authStatus !== "signedIn" || DEV_NOAUTH) return;
        touch(); // fire-and-forget last_login stamp
        // Profile row (username, joined date) plus the avatar slug from auth
        // metadata. allSettled so a hiccup fetching the avatar can never block
        // the profile itself — the username must always render.
        Promise.allSettled([fetchProfile(), fetchAvatar()]).then(([pr, av]) => {
            const prof = pr.status === "fulfilled" ? pr.value : null;
            const avatar = av.status === "fulfilled" ? av.value : null;
            setAccountProfile(prof ? {...prof, avatar} : prof);
        });
        fetchStats().then(setAccountStats);
    }, [authStatus]);

    // Set/clear the profile picture, then reflect it locally (optimistic — the
    // server write already succeeded before this resolves).
    const changeAvatar = async (name) => {
        const {error} = await setAvatar(name);
        if (!error) setAccountProfile((p) => (p ? {...p, avatar: name} : p));
    };

    useEffect(() => {
        if (authStatus !== "signedIn" || screen !== "menu") return;
        fetchStats().then(setAccountStats);
    }, [authStatus, screen]);
    const changeSettings = (s) => {
        setSettings(s);
        saveSettings(s);
        setGlobe(s.globe);
        applyAudioSettings(s);
    };

    const backdrop = useMemo(() => {
        if (!data || !belligerents.length) return [];
        const set = new Set(belligerents), out = [];
        for (const [iso, arr] of Object.entries(data.cities)) if (!set.has(iso)) for (const c of arr) out.push(c);
        return out;
    }, [data, belligerents]);

    const countryLabels = useMemo(() => {
        if (!data) return [];
        // Only ACTIVE belligerents get a slot here — world.nations also carries the
        // inactive neutral background nations, and including them would flag every
        // country as combat and label the whole map (CountryLabels only names combat
        // nations). Matches the active-nation filter used for the ownership layer.
        const slotOf = {};
        (world?.nations || []).forEach((n) => {
            if (n.active === false) return;
            slotOf[n.iso] = n.slot;
        });
        const out = [];
        for (const [iso, arr] of Object.entries(data.cities)) {
            if (!arr?.length) continue;
            let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180, sLa = 0, sLo = 0;
            for (const c of arr) {
                sLa += c.lat;
                sLo += c.lng;
                if (c.lat < minLa) minLa = c.lat;
                if (c.lat > maxLa) maxLa = c.lat;
                if (c.lng < minLo) minLo = c.lng;
                if (c.lng > maxLo) maxLo = c.lng;
            }
            const lat = sLa / arr.length, lng = sLo / arr.length, spanLo = maxLo - minLo;
            const ext = Math.max(spanLo * Math.cos((lat * Math.PI) / 180), maxLa - minLa);
            let w = Math.max(0.45, Math.min(2.4, Math.log2(1 + ext) * 0.62));
            if (spanLo > 200) w = Math.min(w, 0.5); // dateline-crossing centroid is unreliable
            const cn = data.countries.find((c) => c.iso === iso);
            out.push({iso, name: cn?.name || iso, lng, lat, w, mine: slotOf[iso] === 0, combat: slotOf[iso] != null});
        }
        return out;
    }, [data, world]);

    const enterGame = (w, isos, prof) => {
        setWorld(w);
        setBelligerents(isos);
        setGlobe(settings.globe);
        if (prof) setProfile(prof);
        setSession((s) => s + 1);
        setScreen("playing");
        setOverlay(null);
        wallStartedAtRef.current = new Date().toISOString();
        reportedRef.current = false;
    };

    const onStart = (iso, rulesIn) => {
        if (!data) return;
        // Your in-game identity is your account username — no separate "commander
        // name" is collected anywhere.
        const name = accountProfile?.username || "Commander";
        const rules = normalizeRules(rulesIn ?? spRules);
        // Bounded neutral-world match: the player claims `iso`; up to
        // rules.activeCount nations participate (the player plus scattered great
        // powers), and every other country stays on the map as a passive, capturable
        // neutral.
        const setup = buildSetup(data, iso, null, Math.floor(Math.random() * 1e9), {activeCount: rules.activeCount, rules});
        const w = createWorld(setup);
        // Fresh solo matches always open at 1x and paused — the commander presses
        // play to begin. In-game speed hotkeys still work once running.
        w.speed = 1;
        w.paused = true;
        w.meta = {playerIso: iso, playerName: name, belligerents: setup.belligerents};
        setSpRules(rules);
        saveSettings({...settings, rules});
        enterGame(w, setup.belligerents, {name, iso});
    };
    const onLoadSlot = (slot) => {
        const s = loadGame(slot);
        if (!s?.world) return;
        const w = s.world;
        w.paused = true; // loaded solo games resume paused so nothing advances before the player is ready
        enterGame(w, s.meta?.belligerents || w.meta?.belligerents || [], {
            name: s.meta?.playerName || "Commander",
            iso: s.meta?.playerIso
        });
    };
    const onContinue = () => {
        const list = listSaves();
        if (list.length) onLoadSlot(list[0].slot);
    };
    const doSave = useCallback((slot) => {
        if (!world) return;
        saveGame(slot, world, {
            at: Date.now(),
            playerName: profile.name,
            playerIso: profile.iso,
            gtime: Math.round(world.time),
            nations: world.nations.filter((n) => n.alive).length,
            belligerents
        });
    }, [world, profile, belligerents]);
    const pause = () => {
        // Online matches never pause — the server is authoritative and would just
        // overwrite it on the next snapshot; only the menu overlay opens.
        if (world && !netClient) world.paused = true;
        setOverlay("pause");
    };
    const resume = () => {
        if (world && !netClient) world.paused = false;
        setOverlay(null);
    };
    // Cheap, null-safe snapshot of the player's standing at report time — not
    // owned state, just a read of what the engine already tracks.
    const matchStatsOf = (w) => ({
        points: w.nations.find((n) => n.slot === w.mySlot)?.points ?? 0,
        citiesLeft: w.cities.filter((c) => c.slot === w.mySlot && c.alive).length,
        unitsAlive: w.units.filter((u) => u.slot === w.mySlot && u.hp > 0).length
    });
    // Refresh the menu stats once the report actually lands — the menu can
    // render before the insert resolves, and stale numbers read as a bug.
    const reportAndRefresh = (match) => reportMatch(match).then(() => fetchStats().then(setAccountStats));
    const onGameEnd = ({result}) => {
        if (netClient) return; // online results are recorded by the server
        if (!world || reportedRef.current) return;
        reportedRef.current = true;
        reportAndRefresh({
            startedAt: wallStartedAtRef.current,
            result,
            nationIso: profile.iso,
            opponents: world.nations.filter((n) => n.active).length - 1,
            durationS: Math.round(world.time),
            stats: matchStatsOf(world)
        });
    };
    const quitToMenu = () => {
        if (netClient) {
            // Online: the server owns saves and results — just hang up.
            netClient.close();
            setNetClient(null);
            setNetStatus(null);
        } else {
            if (world && !world.over) doSave(AUTOSAVE);
            if (world && !world.over && !reportedRef.current) {
                reportedRef.current = true;
                reportAndRefresh({
                    startedAt: wallStartedAtRef.current,
                    result: "quit",
                    nationIso: profile.iso,
                    opponents: world.nations.filter((n) => n.active).length - 1,
                    durationS: Math.round(world.time),
                    stats: matchStatsOf(world)
                });
            }
        }
        setNetError(null);
        retryLobbyRef.current = null;
        setLobbyId(null);
        setOverlay(null);
        setScreen("menu");
        setWorld(null);
    };

    // A lobby the player is in went active: dial the game server it advertised.
    // On any failure we hold on the "failed" state (NetErrorOverlay renders a
    // copyable dump) instead of silently dumping the player back to the menu —
    // that path was indistinguishable from a legitimate quit and lost every clue
    // about why the handoff failed.
    const joinMatch = async (lobby) => {
        if (netClient || netStatus === "connecting") return;
        retryLobbyRef.current = lobby;
        setNetStatus("connecting");
        setNetError(null);
        try {
            const client = await connectMatch({
                urls: (lobby.server_url || "").split(",").map((s) => s.trim()).filter(Boolean),
                matchId: lobby.match_id,
                getJwt: async () => (await supabase.auth.getSession()).data.session?.access_token ?? "",
                onOver: () => fetchStats().then(setAccountStats),
                onClose: (why, details) => {
                    if (why === "lost") {
                        setNetStatus("lost");
                        setNetError(details || null);
                    }
                },
            });
            setNetClient(client);
            setNetStatus(null);
            setNetError(null);
            setWorld(client.world);
            setBelligerents(client.world.nations.map((n) => n.iso));
            setProfile({
                name: accountProfile?.username || "Commander",
                iso: client.world.nations.find((n) => n.slot === client.slot)?.iso
            });
            setGlobe(settings.globe);
            setSession((s) => s + 1);
            setScreen("playing");
            setOverlay(null);
        } catch (e) {
            console.warn("match connect failed", e);
            const detail = [
                e?.details,
                `matchId: ${lobby?.match_id || "(none)"}`,
                `serverUrls: ${lobby?.server_url || "(none advertised)"}`,
                `error: ${e?.message || String(e)}`,
            ].filter(Boolean).join("\n");
            setNetStatus("failed");
            setNetError(detail);
        }
    };

    // Retry: re-invoke joinMatch against the same lobby snapshot. Clears the
    // overlay so the connecting state can render underneath while we wait.
    const retryJoinMatch = () => {
        const lobby = retryLobbyRef.current;
        if (!lobby) return dismissNetError();
        setNetError(null);
        setNetStatus(null);
        void joinMatch(lobby);
    };

    // Dismiss the failure/lost overlay and drop the player back at the main
    // menu — clears every online-match handle so a fresh Play from the menu is
    // clean.
    const dismissNetError = () => {
        if (netClient) {
            netClient.close();
            setNetClient(null);
        }
        retryLobbyRef.current = null;
        setNetStatus(null);
        setNetError(null);
        setLobbyId(null);
        setOverlay(null);
        setWorld(null);
        setScreen("menu");
    };

    useEffect(() => {
        if (screen !== "playing" || netClient) return; // online worlds live on the server
        const t = setInterval(() => {
            if (world && !world.over) doSave(AUTOSAVE);
        }, 60000);
        return () => clearInterval(t);
    }, [screen, world, netClient, doSave]);

    const closeOverlay = () => setOverlay(screen === "playing" ? "pause" : null);

    // The live attract war plays behind login and menu — never during a real
    // game, never under reduced motion (the static backdrop stands in).
    const attractOn = data && !reduceMotion && (authStatus !== "signedIn" || screen === "menu");
    // On the main menu the chrome sits in a left rail, so nudge the globe's
    // projection center rightward to keep it clear of the console.
    const attract = attractOn
        ? <AttractSim data={data} framed={authStatus === "signedIn" && screen === "menu"}/>
        : null;
    const splash = !splashDone &&
        <SplashSequence reduceMotion={reduceMotion} onDone={() => setSplashDone(true)}/>;

    // Login is required — no offline bypass. Loading shows a minimal splash;
    // signed-out renders the gate in place of every other screen.
    if (authStatus === "loading") {
        return <div className="relative z-[1] flex flex-col h-full"><TitleBarDrag/>{splash}
            <div className="absolute inset-0 grid place-items-center bg-bg">
                <span className="font-display tracking-[6px] uppercase text-[13px] text-dim animate-[dbRowIn_400ms_var(--ease-out)_both]">Connecting…</span>
            </div>
        </div>;
    }
    if (authStatus === "signedOut") {
        return <div className="relative z-[1] flex flex-col h-full"><TitleBarDrag/>{attract}<LoginScreen/>{splash}</div>;
    }

    return (
        <div className="relative z-[1] flex flex-col h-full">
            <TitleBarDrag/>
            {attract}
            {splash}
            {screen !== "playing" &&
                <MeBadge profile={accountProfile} stats={accountStats} onSignOut={signOut} onSetAvatar={changeAvatar} presence={presence} partyCtl={partyHook}/>}
            {screen === "menu" &&
                <StartMenu canContinue={hasContinue()} onNew={() => setScreen("newgame")} onContinue={onContinue}
                           onPlay={() => setScreen("searching")}
                           onLoad={() => {
                               setSaveMode("load");
                               setOverlay("saveload");
                           }} onSettings={() => setOverlay("settings")} profile={accountProfile}
                           stats={accountStats} onSignOut={signOut} onlineCount={onlineCount}/>}
            {screen === "newgame" &&
                <NewGame data={data} settings={settings}
                         onStart={(iso) => { setNewGameIso(iso); setScreen("newgame-rules"); }}
                         onBack={() => setScreen("menu")}/>}
            {screen === "newgame-rules" && newGameIso &&
                <NewGameRules data={data} iso={newGameIso} initialRules={spRules}
                              onStart={(rules) => { onStart(newGameIso, rules); setNewGameIso(null); }}
                              onBack={() => { setNewGameIso(null); setScreen("newgame"); }}/>}
            {screen === "searching" &&
                <SearchingScreen reduceMotion={reduceMotion} preQueued={partySearch}
                                  onMatched={(id) => {
                                      setPartySearch(false);
                                      setLobbyId(id);
                                      setScreen("lobby");
                                  }}
                                  onCancel={() => {
                                      setPartySearch(false);
                                      setScreen("menu");
                                  }}/>}
            {screen === "lobby" && lobbyId &&
                <ErrorBoundary onReset={() => { setLobbyId(null); setScreen("menu"); }}>
                    <LobbyScreen lobbyId={lobbyId} me={accountProfile} connecting={netStatus === "connecting"}
                                 data={data} onLaunch={joinMatch}
                                 onLeft={() => {
                                     setLobbyId(null);
                                     setScreen("menu");
                                 }}/>
                </ErrorBoundary>}
            {screen === "playing" && world &&
                <ErrorBoundary onReset={quitToMenu}>
                    <LiveGame key={session} world={world} net={netClient} globe={globe} keys={keys}
                              onToggleGlobe={() => setGlobe((g) => !g)}
                              onPause={pause} backdrop={backdrop} overlayOpen={overlay !== null} labels={countryLabels}
                              onGameEnd={onGameEnd}
                              meBadge={<MeBadge profile={accountProfile} stats={accountStats} inGame
                                                players={netClient?.players} onSetAvatar={changeAvatar} presence={presence} partyCtl={partyHook}/>}/>
                </ErrorBoundary>}
            {netStatus === "failed" &&
                <NetErrorOverlay
                    title="Match Connect Failed"
                    message="Couldn't hand off from the war room to the game server."
                    details={netError}
                    onRetry={retryJoinMatch}
                    onDismiss={dismissNetError}/>}
            {netStatus === "lost" && screen === "playing" &&
                <NetErrorOverlay
                    title="Connection Lost"
                    message="Your link to the war server dropped. The war goes on without you."
                    details={netError}
                    onDismiss={quitToMenu}/>}

            {overlay === "pause" && <PauseMenu over={world?.over} onResume={resume} onSave={() => {
                setSaveMode("save");
                setOverlay("saveload");
            }} onLoad={() => {
                setSaveMode("load");
                setOverlay("saveload");
            }} onSettings={() => setOverlay("settings")} onQuit={quitToMenu}/>}
            {overlay === "settings" &&
                <SettingsPanel settings={settings} onChange={changeSettings} onClose={closeOverlay}/>}
            {overlay === "saveload" &&
                <SaveLoadPanel mode={saveMode} onSave={doSave} onLoad={onLoadSlot} onClose={closeOverlay}/>}
        </div>
    );
}
