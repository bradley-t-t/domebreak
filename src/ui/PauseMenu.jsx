export default function PauseMenu({ onResume, onSave, onLoad, onSettings, onQuit, over }) {
  return (
    <div className="gd-overlay center">
      <div className="gd-card gd-pausemenu gd-pop">
        <div className="gd-menu-title sm">{over ? "Game Over" : "Paused"}</div>
        <div className="gd-menu-btns">
          {!over && <button className="gd-menu-btn primary" onClick={onResume}>Resume</button>}
          {!over && <button className="gd-menu-btn" onClick={onSave}>Save Game</button>}
          <button className="gd-menu-btn" onClick={onLoad}>Load Game</button>
          <button className="gd-menu-btn" onClick={onSettings}>Settings</button>
          <button className="gd-menu-btn danger" onClick={onQuit}>Quit to Menu</button>
        </div>
        {!over && <div className="gd-menu-hint">Space pause · + / − speed · 1–5 speed level · Esc menu</div>}
      </div>
    </div>
  );
}
