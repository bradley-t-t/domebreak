import {useEffect, useMemo, useRef, useState} from "react";
import StartMenu from "./ui/screens/StartMenu.jsx";
import NewGame from "./ui/screens/NewGame.jsx";
import LiveGame from "./ui/live/LiveGame.jsx";
import PauseMenu from "./ui/screens/PauseMenu.jsx";
import SettingsPanel from "./ui/screens/SettingsPanel.jsx";
import SaveLoadPanel from "./ui/screens/SaveLoadPanel.jsx";
import LoginScreen from "./ui/screens/LoginScreen.jsx";
import SplashSequence from "./ui/screens/SplashSequence.jsx";
import AttractSim from "./ui/live/AttractSim.jsx";
import {createWorld} from "./game/engine.js";
import {buildSetup, loadGameData} from "./game/sim/newGame.js";
import {loadSettings, saveSettings} from "./game/platform/settings.js";
import {resolveKeys} from "./game/platform/keybindings.js";
import {applyAudioSettings, initAudio} from "./game/platform/audio.js";
import {AUTOSAVE, hasContinue, listSaves, loadGame, saveGame} from "./game/platform/saves.js";
import {fetchProfile, fetchStats, getSession, onAuth, reportMatch, signOut, touch} from "./account/api.js";
import {connectMatch} from "./net/gameClient.js";
import {supabase} from "./account/client.js";
import MeBadge from "./ui/common/MeBadge.jsx";
import MultiplayerScreen from "./ui/screens/MultiplayerScreen.jsx";
import LobbyScreen from "./ui/screens/LobbyScreen.jsx";

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
    // Online play: current lobby room and the live match connection.
    const [lobbyId, setLobbyId] = useState(null);
    const [netClient, setNetClient] = useState(null);
    const [netStatus, setNetStatus] = useState(null); // null | "connecting" | "lost"
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

    useEffect(() => {
        loadGameData().then(setData).catch(() => {
        });
        initAudio(loadSettings());
    }, []);

    // Session bootstrap + subscription. getSession() covers the already-signed-in
    // reload case; onAuth covers sign-in/sign-out happening while mounted.
    useEffect(() => {
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
        if (authStatus !== "signedIn") return;
        touch(); // fire-and-forget last_login stamp
        fetchProfile().then(setAccountProfile);
        fetchStats().then(setAccountStats);
    }, [authStatus]);

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
        const slotOf = {};
        (world?.nations || []).forEach((n) => {
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

    const onStart = (iso, name, aiIsos) => {
        if (!data) return;
        const setup = buildSetup(data, iso, aiIsos, Math.floor(Math.random() * 1e9));
        const w = createWorld(setup);
        w.speed = settings.speed;
        w.paused = false;
        w.meta = {playerIso: iso, playerName: name, belligerents: setup.belligerents};
        enterGame(w, setup.belligerents, {name, iso});
    };
    const onLoadSlot = (slot) => {
        const s = loadGame(slot);
        if (!s?.world) return;
        const w = s.world;
        w.paused = false;
        enterGame(w, s.meta?.belligerents || w.meta?.belligerents || [], {
            name: s.meta?.playerName || "Commander",
            iso: s.meta?.playerIso
        });
    };
    const onContinue = () => {
        const list = listSaves();
        if (list.length) onLoadSlot(list[0].slot);
    };
    const doSave = (slot) => {
        if (!world) return;
        saveGame(slot, world, {
            at: Date.now(),
            playerName: profile.name,
            playerIso: profile.iso,
            gtime: Math.round(world.time),
            nations: world.nations.filter((n) => n.alive).length,
            belligerents
        });
    };
    const pause = () => {
        if (world) world.paused = true;
        setOverlay("pause");
    };
    const resume = () => {
        if (world) world.paused = false;
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
            opponents: world.nations.length - 1,
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
                    opponents: world.nations.length - 1,
                    durationS: Math.round(world.time),
                    stats: matchStatsOf(world)
                });
            }
        }
        setLobbyId(null);
        setOverlay(null);
        setScreen("menu");
        setWorld(null);
    };

    // A lobby the player is in went active: dial the game server it advertised.
    const joinMatch = async (lobby) => {
        if (netClient || netStatus === "connecting") return;
        setNetStatus("connecting");
        try {
            const client = await connectMatch({
                urls: (lobby.server_url || "").split(",").map((s) => s.trim()).filter(Boolean),
                matchId: lobby.match_id,
                getJwt: async () => (await supabase.auth.getSession()).data.session?.access_token ?? "",
                onOver: () => fetchStats().then(setAccountStats),
                onClose: (why) => {
                    if (why === "lost") setNetStatus("lost");
                },
            });
            setNetClient(client);
            setNetStatus(null);
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
            setNetStatus(null);
            setLobbyId(null);
            setScreen("multiplayer");
            console.warn("match connect failed", e);
        }
    };

    useEffect(() => {
        if (screen !== "playing" || netClient) return; // online worlds live on the server
        const t = setInterval(() => {
            if (world && !world.over) doSave(AUTOSAVE);
        }, 60000);
        return () => clearInterval(t);
    }, [screen, world, netClient]);

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
        return <div className="gd-app">{splash}
            <div className="gd-connecting"><span>Connecting…</span></div>
        </div>;
    }
    if (authStatus === "signedOut") {
        return <div className="gd-app">{attract}<LoginScreen/>{splash}</div>;
    }

    return (
        <div className="gd-app">
            {attract}
            {splash}
            {screen !== "playing" &&
                <MeBadge profile={accountProfile} stats={accountStats} onSignOut={signOut}/>}
            {screen === "menu" &&
                <StartMenu canContinue={hasContinue()} onNew={() => setScreen("newgame")} onContinue={onContinue}
                           onMultiplayer={() => setScreen("multiplayer")}
                           onLoad={() => {
                               setSaveMode("load");
                               setOverlay("saveload");
                           }} onSettings={() => setOverlay("settings")} profile={accountProfile}
                           stats={accountStats} onSignOut={signOut}/>}
            {screen === "newgame" &&
                <NewGame data={data} settings={settings} onStart={onStart} onBack={() => setScreen("menu")}/>}
            {screen === "multiplayer" &&
                <MultiplayerScreen onEnterLobby={(id) => {
                    setLobbyId(id);
                    setScreen("lobby");
                }} onBack={() => setScreen("menu")}/>}
            {screen === "lobby" && lobbyId &&
                <LobbyScreen lobbyId={lobbyId} me={accountProfile} connecting={netStatus === "connecting"}
                             onLaunch={joinMatch}
                             onLeft={() => {
                                 setLobbyId(null);
                                 setScreen("multiplayer");
                             }}/>}
            {screen === "playing" && world &&
                <LiveGame key={session} world={world} net={netClient} globe={globe} keys={keys}
                          onToggleGlobe={() => setGlobe((g) => !g)}
                          onPause={pause} backdrop={backdrop} overlayOpen={overlay !== null} labels={countryLabels}
                          onGameEnd={onGameEnd}
                          meBadge={<MeBadge profile={accountProfile} stats={accountStats} inGame
                                            players={netClient?.players}/>}/>}
            {netStatus === "lost" && screen === "playing" &&
                <div className="gd-netlost">CONNECTION LOST — the war goes on without you.
                    <button className="gd-menu-btn" onClick={quitToMenu}>Return to Menu</button>
                </div>}

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
