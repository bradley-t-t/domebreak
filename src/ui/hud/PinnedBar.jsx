import {colorForSlot} from "../../game/data/constants.js";

export default function PinnedBar({pins, onGo, onRemove}) {
    if (!pins.length) return null;
    return (
        <div className="absolute top-[60px] right-4 z-5 w-[190px] bg-panel border border-line rounded px-[10px] py-2 backdrop-blur-[10px]">
            <div className="text-[10px] tracking-[1px] uppercase text-faint mb-[5px]">Pinned</div>
            {pins.map((p) => (
                <div key={p.key} className="flex items-center gap-1">
                    <button className="flex-1 flex items-center gap-[7px] bg-transparent border-none text-text text-left text-xs px-0.5 py-1 whitespace-nowrap overflow-hidden text-ellipsis hover:text-gold"
                            onClick={() => onGo(p)} title="Fly To"
                            aria-label={`Fly to ${p.label}`}>
                        <span className="w-[10px] h-[10px] rounded-full bg-faint flex-none"
                              style={{background: p.color || colorForSlot(0)}} aria-hidden="true"/>{p.label}
                    </button>
                    <button className="bg-transparent border-none text-faint text-sm px-1 py-0 hover:text-danger"
                            onClick={() => onRemove(p.key)}
                            aria-label={`Remove pin ${p.label}`}>×</button>
                </div>
            ))}
        </div>
    );
}
