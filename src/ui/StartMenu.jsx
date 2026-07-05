export default function StartMenu({onNew, onContinue, onLoad, onSettings, canContinue}) {
    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner">
                <h1 className="gd-menu-title">GOLDEN<span>DOME</span></h1>
                <p className="gd-menu-tag">Global missile command</p>
                <div className="gd-menu-btns">
                    {canContinue && <button className="gd-menu-btn primary" onClick={onContinue}>Continue</button>}
                    <button className={`gd-menu-btn ${canContinue ? "" : "primary"}`} onClick={onNew}>New Game</button>
                    <button className="gd-menu-btn" onClick={onLoad}>Load Game</button>
                    <button className="gd-menu-btn" onClick={onSettings}>Settings</button>
                </div>
                <div className="gd-menu-foot">by Trenton Taylor · world map © Open Historia (MIT) · icons game-icons.net
                    (CC BY)
                </div>
            </div>
        </div>
    );
}
