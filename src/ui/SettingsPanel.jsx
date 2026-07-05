import { GAME_SPEEDS } from "../game/constants.js";

export default function SettingsPanel({ settings, onChange, onClose }) {
  const set = (k, v) => onChange({ ...settings, [k]: v });
  return (
    <div className="gd-overlay center" onClick={onClose}>
      <div className="gd-card" onClick={(e) => e.stopPropagation()}>
        <div className="gd-menu-title sm">Settings</div>
        <div className="gd-set-row"><span>Default speed</span>
          <div className="gd-seg">{GAME_SPEEDS.map((s) => <button key={s} className={settings.speed === s ? "active" : ""} onClick={() => set("speed", s)}>{s}×</button>)}</div>
        </div>
        <div className="gd-set-row"><span>Default view</span>
          <div className="gd-seg"><button className={settings.globe ? "active" : ""} onClick={() => set("globe", true)}>Globe</button><button className={!settings.globe ? "active" : ""} onClick={() => set("globe", false)}>Flat</button></div>
        </div>
        <div className="gd-set-row"><span>Default opponents</span>
          <div className="gd-set-slider"><input type="range" min="1" max="12" value={settings.opponents} onChange={(e) => set("opponents", +e.target.value)} /><b>{settings.opponents}</b></div>
        </div>
        <div className="gd-set-row"><span>Reduce motion</span>
          <button className={`gd-toggle ${settings.reduceMotion ? "on" : ""}`} onClick={() => set("reduceMotion", !settings.reduceMotion)}><span /></button>
        </div>
        <button className="gd-btn primary" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
