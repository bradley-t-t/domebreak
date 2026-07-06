import {cn} from "../lib/cn.js";

const LAYER_DEFS = [
    {id: "countries", label: "Countries", glyph: "◔"},
    {id: "states", label: "State Borders", glyph: "▦"},
    {id: "defense", label: "Defense Range", glyph: "⬡"},
    {id: "radar", label: "Radar Coverage", glyph: "❉"},
    {id: "pop", label: "Population Heat", glyph: "◉"},
    {id: "backdrop", label: "World Cities", glyph: "∴"},
];
export default function LayerBar({layers, onToggle}) {
    return (
        <div className="absolute bottom-4 right-4 z-5 flex flex-row items-stretch gap-1 w-auto rounded-lg bg-panel border border-line p-[6px] shadow backdrop-blur-[12px]"
             role="group" aria-label="Map layers">
            {LAYER_DEFS.map((l) => (
                <button key={l.id}
                        className={cn("flex flex-col items-center justify-start gap-1 w-[68px] px-[5px] py-[7px] text-center text-[9.5px] rounded text-dim transition-[background,color] duration-150 ease-out-gd hover:bg-[#141619] hover:text-text", layers[l.id] && "bg-[#15171b] text-text")}
                        aria-pressed={!!layers[l.id]}
                        aria-label={`${l.label} layer, ${layers[l.id] ? "on" : "off"}`}
                        onClick={() => onToggle(l.id)}>
                    <span
                        className={cn("text-[15px] leading-none", layers[l.id] && "text-gold [text-shadow:0_0_8px_var(--gold)]")}
                        aria-hidden="true">{l.glyph}</span><span
                    className="flex-none text-center leading-[1.2] whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{l.label}</span>
                </button>
            ))}
        </div>
    );
}
