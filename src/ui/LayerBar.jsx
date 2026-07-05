const LAYER_DEFS = [
    {id: "countries", label: "Countries", glyph: "◔"},
    {id: "states", label: "State borders", glyph: "▦"},
    {id: "defense", label: "Defense range", glyph: "⬡"},
    {id: "radar", label: "Radar coverage", glyph: "❉"},
    {id: "pop", label: "Population heat", glyph: "◉"},
    {id: "backdrop", label: "World cities", glyph: "∴"},
];
export default function LayerBar({layers, onToggle}) {
    return (
        <div className="gd-layerbar">
            <div className="gd-layerbar-t">Map Layers</div>
            {LAYER_DEFS.map((l) => (
                <button key={l.id} className={`gd-layerbtn ${layers[l.id] ? "on" : ""}`} onClick={() => onToggle(l.id)}>
                    <span className="gd-layerbtn-g">{l.glyph}</span><span
                    className="gd-layerbtn-l">{l.label}</span><span className="gd-layerdot"/>
                </button>
            ))}
        </div>
    );
}
