import {useEffect, useMemo, useState} from "react";
import StartMenu from "./ui/StartMenu.jsx";
import NewGame from "./ui/NewGame.jsx";
import LiveGame from "./ui/LiveGame.jsx";
import PauseMenu from "./ui/PauseMenu.jsx";
import SettingsPanel from "./ui/SettingsPanel.jsx";
import SaveLoadPanel from "./ui/SaveLoadPanel.jsx";
import {createWorld} from "./game/engine.js";
import {buildSetup, loadGameData} from "./game/newGame.js";
import {loadSettings, saveSettings} from "./game/settings.js";
import {AUTOSAVE, hasContinue, listSaves, loadGame, saveGame} from "./game/saves.js";

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

    useEffect(() => {
        loadGameData().then(setData).catch(() => {
        });
    }, []);
    const changeSettings = (s) => {
        setSettings(s);
        saveSettings(s);
        setGlobe(s.globe);
    };

    const backdrop = useMemo(() => {
        if (!data || !belligerents.length) return [];
        const set = new Set(belligerents), out = [];
        for (const [iso, arr] of Object.entries(data.cities)) if (!set.has(iso)) for (const c of arr) out.push(c);
        return out;
    }, [data, belligerents]);

  const countryLabels = useMemo(() => {
    if (!data) return [];
    const slotOf = {}; (world?.nations || []).forEach((n) => { slotOf[n.iso] = n.slot; });
    const out = [];
    for (const [iso, arr] of Object.entries(data.cities)) {
      if (!arr?.length) continue;
      let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180, sLa = 0, sLo = 0;
      for (const c of arr) { sLa += c.lat; sLo += c.lng; if (c.lat < minLa) minLa = c.lat; if (c.lat > maxLa) maxLa = c.lat; if (c.lng < minLo) minLo = c.lng; if (c.lng > maxLo) maxLo = c.lng; }
      const lat = sLa / arr.length, lng = sLo / arr.length, spanLo = maxLo - minLo;
      const ext = Math.max(spanLo * Math.cos((lat * Math.PI) / 180), maxLa - minLa);
      let w = Math.max(0.45, Math.min(2.4, Math.log2(1 + ext) * 0.62));
      if (spanLo > 200) w = Math.min(w, 0.5); // dateline-crossing centroid is unreliable
      const cn = data.countries.find((c) => c.iso === iso);
      out.push({ iso, name: cn?.name || iso, lng, lat, w, mine: slotOf[iso] === 0 });
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
    };

    const onStart = (iso, name, opps) => {
        if (!data) return;
        const setup = buildSetup(data, iso, opps, Math.floor(Math.random() * 1e9));
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
    const quitToMenu = () => {
        if (world && !world.over) doSave(AUTOSAVE);
        setOverlay(null);
        setScreen("menu");
        setWorld(null);
    };

    useEffect(() => {
        if (screen !== "playing") return;
        const t = setInterval(() => {
            if (world && !world.over) doSave(AUTOSAVE);
        }, 60000);
        return () => clearInterval(t);
    }, [screen, world]);

    const closeOverlay = () => setOverlay(screen === "playing" ? "pause" : null);

  return (
    <div className="gd-app">
      {screen === "menu" && <StartMenu canContinue={hasContinue()} onNew={() => setScreen("newgame")} onContinue={onContinue} onLoad={() => { setSaveMode("load"); setOverlay("saveload"); }} onSettings={() => setOverlay("settings")} />}
      {screen === "newgame" && <NewGame data={data} settings={settings} onStart={onStart} onBack={() => setScreen("menu")} />}
      {screen === "playing" && world && <LiveGame key={session} world={world} globe={globe} onToggleGlobe={() => setGlobe((g) => !g)} onPause={pause} backdrop={backdrop} overlayOpen={overlay !== null} labels={countryLabels} />}

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
