import {colorForSlot} from "../../game/data/constants.js";

export default function PinnedBar({pins, onGo, onRemove}) {
    if (!pins.length) return null;
    return (
        <div className="gd-pins">
            <div className="gd-pins-title">Pinned</div>
            {pins.map((p) => (
                <div key={p.key} className="gd-pin">
                    <button className="gd-pin-go" onClick={() => onGo(p)} title="Fly To"
                            aria-label={`Fly to ${p.label}`}>
                        <span className="gd-slot-dot" style={{background: p.color || colorForSlot(0)}} aria-hidden="true"/>{p.label}
                    </button>
                    <button className="gd-pin-x" onClick={() => onRemove(p.key)}
                            aria-label={`Remove pin ${p.label}`}>×</button>
                </div>
            ))}
        </div>
    );
}
