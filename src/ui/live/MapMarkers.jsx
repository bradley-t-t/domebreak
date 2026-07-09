// All of the on-map Markers for the live match: the selected-city ring, the
// floating capture-progress badges, unit icons (with heading rotation/fade),
// fallout clouds, and impact explosions. Pure presentational fan-out over
// state/derived data computed in LiveGame.
import {Marker} from "react-map-gl/maplibre";
import UnitIcon from "../common/UnitIcon.jsx";
import Explosion from "./Explosion.jsx";
import FalloutCloud from "./FalloutCloud.jsx";
import {cn} from "../lib/cn.js";
import {falloutIntensity, UNIT_ICON, UNITS} from "../../game/engine.js";

export default function MapMarkers({
                                        selectedCity, w, mySlot, teamColor, visUnits, unitHeading, unitColor,
                                        labelOf, nationName, selUnit, onUnitClick, openUnitMenu, setHover,
                                        placing, moving, explosions
                                    }) {
    return (
        <>
            {selectedCity && <Marker longitude={selectedCity.lng} latitude={selectedCity.lat} anchor="center" opacityWhenCovered="0">
                <div className="w-4 h-4 rounded-full border-[1.5px] border-[rgba(255,255,255,0.75)] shadow-[0_0_6px_rgba(255,255,255,0.3)]"/>
            </Marker>}
            {/* Capture HUD: a floating badge over every city being taken — the
                occupier's color, live progress %, whether an assault is pressing
                it, and a mini bar. Pairs with the ground ring below the cities so
                a capture reads at a glance (yours, an ally's, or your own falling). */}
            {w.cities.filter((c) => c.alive && c.capture && c.capture.progress > 0.02).map((c) => {
                const pct = Math.round(c.capture.progress * 100);
                const col = teamColor(c.capture.slot);
                const label = c.capture.assault ? "Assault" : (c.slot === mySlot ? "Losing" : "Capturing");
                return (
                    <Marker key={`cap-${c.id}`} longitude={c.lng} latitude={c.lat} anchor="bottom" opacityWhenCovered="0" offset={[0, -13]}>
                        <div className="pointer-events-none flex flex-col items-center gap-[3px]" aria-hidden="true">
                            <div className="flex items-center gap-1 px-1.5 py-[2px] rounded-full bg-[rgba(8,10,14,0.82)] border backdrop-blur-[3px] font-mono text-[10px] leading-none whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.55)]"
                                 style={{borderColor: col, color: col}}>
                                <b className="font-bold">{pct}%</b>
                                <span className="uppercase tracking-[0.6px] text-[8px] opacity-90">{label}</span>
                            </div>
                            <div className="w-[46px] h-[3px] rounded-full bg-[rgba(255,255,255,0.16)] overflow-hidden">
                                <i className="block h-full rounded-full" style={{width: `${pct}%`, background: col}}/>
                            </div>
                        </div>
                    </Marker>
                );
            })}
            {visUnits.map((u) => {
                const def = UNITS[u.type];
                const air = !!(def.airSpeed && u.baseId);
                if (air && (!u.phase || u.phase === "ground")) return null; // housed in the base — not on the map
                const heading = unitHeading(u);
                const alt = air ? (u.alt || 0) : 0;
                const iconName = UNIT_ICON[u.type];
                const iconStyle = {};
                // Ground units are now top-down silhouettes (like the naval hulls), so
                // they rotate to the EXACT heading and read correctly at any angle —
                // no facing snap, no tip-over.
                if (heading != null) iconStyle.transform = `rotate(${heading}deg)`;
                if (air) {
                    iconStyle.opacity = u.vis ?? 1; // engine drives fade-in on takeoff / out on landing
                    iconStyle.transform = `${iconStyle.transform || ""} scale(${(0.7 + alt * 0.3).toFixed(3)})`.trim(); // rises off the deck
                }
                return (
                    <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center"
                            opacityWhenCovered="0" offset={air ? [0, -alt * 30] : undefined}>
                        <div
                            className={cn(
                                "grid place-items-center cursor-pointer [filter:drop-shadow(0_0_4px_currentColor)_drop-shadow(0_1px_2px_#000)] opacity-(--db-unit-opacity,1)",
                                u.id === selUnit && "scale-[1.35] transition-transform duration-[140ms] ease-out-db"
                            )}
                            title={labelOf(u.type, u.slot)}
                            aria-label={`${labelOf(u.type, u.slot)} — ${nationName(u.slot)}`}
                            onClick={(e) => onUnitClick(u, e)}
                            onContextMenu={(e) => openUnitMenu(u, e)}
                            onMouseEnter={(e) => {
                                if (!placing && !moving) setHover({
                                    kind: "unit",
                                    id: u.id,
                                    x: e.clientX,
                                    y: e.clientY
                                });
                            }}
                            onMouseMove={(e) => setHover((h) => (h && h.kind === "unit" && h.id === u.id ? {
                                ...h,
                                x: e.clientX,
                                y: e.clientY
                            } : h))}
                            onMouseLeave={() => setHover((h) => (h && h.kind === "unit" && h.id === u.id ? null : h))}>
              <span className="inline-flex transition-transform duration-[170ms] ease-linear" style={Object.keys(iconStyle).length ? iconStyle : undefined}>
                <UnitIcon name={iconName} color={unitColor(u)} size={air ? 16 : 22}/>
              </span>
                        </div>
                    </Marker>
                );
            })}
            {(w.effects || []).filter((fx) => fx.type === "fallout").map((fx) => (
                <Marker key={fx.id} longitude={fx.lng} latitude={fx.lat} anchor="center" opacityWhenCovered="0">
                    <FalloutCloud intensity={falloutIntensity(fx.age)}/>
                </Marker>
            ))}
            {explosions.map((x) => <Marker key={x.id} longitude={x.lng} latitude={x.lat} anchor="center"
                                           opacityWhenCovered="0" offset={[0, -(x.alt || 0) * 70]}><Explosion kind={x.kind}/></Marker>)}
        </>
    );
}
