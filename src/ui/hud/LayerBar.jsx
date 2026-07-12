import {cn} from "../lib/cn.js";
import Icon from "../common/Icon.jsx";

const LAYER_DEFS = [
    {id: "countries", label: "Countries", icon: "countries"},
    {id: "diplomacy", label: "Diplomacy", icon: "diplomacy-scale"},
    {id: "states", label: "State Borders", icon: "borders"},
    {id: "defense", label: "Defense Range", icon: "defense"},
    {id: "radar", label: "Radar Coverage", icon: "radar"},
    {id: "pop", label: "Population Heat", icon: "pop"},
    {id: "backdrop", label: "World Cities", icon: "cities"},
];
export default function LayerBar({layers, onToggle}) {
    return (
        <div className="flex flex-row items-stretch gap-1 w-auto rounded-lg bg-panel border border-line p-[6px] shadow backdrop-blur-[12px]"
             role="group" aria-label="Map layers">
            {LAYER_DEFS.map((l) => (
                <button key={l.id}
                        className={cn("flex flex-col items-center justify-start gap-1 w-[68px] px-[5px] py-[7px] text-center text-[9.5px] rounded text-dim transition-[background,color] duration-150 ease-out-db hover:bg-[#141619] hover:text-text", layers[l.id] && "bg-[#15171b] text-text")}
                        aria-pressed={!!layers[l.id]}
                        aria-label={`${l.label} layer, ${layers[l.id] ? "on" : "off"}`}
                        onClick={() => onToggle(l.id)}>
                    <Icon name={l.icon} size={17}
                          className={cn(layers[l.id] && "text-gold")}/><span
                    className="flex-none text-center leading-[1.2] whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{l.label}</span>
                </button>
            ))}
        </div>
    );
}
