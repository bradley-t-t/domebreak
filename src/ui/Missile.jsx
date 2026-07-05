import {Marker, useMap} from "react-map-gl/maplibre";
import {bearing} from "../game/geo.js";

const ALT = {silo: 88, launcher: 44};

// Oriented sprite lifted off the ground track by its ballistic altitude (altNorm)
// so it arcs into the sky rather than hugging the surface.
export default function Missile({p}) {
    const map = useMap().current;
    let deg;
    if (map) {
        const a = map.project([p.lng, p.lat]);
        let b = map.project([p.aheadLng ?? p.toLng, p.aheadLat ?? p.toLat]);
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) b = map.project([p.toLng, p.toLat]);
        deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
    } else deg = bearing(p.fromLng, p.fromLat, p.toLng, p.toLat);
    return (
        <Marker longitude={p.lng} latitude={p.lat} anchor="center"
                offset={[0, -(p.altNorm || 0) * (ALT[p.type] || 60)]}>
            <div className="gd-missile" style={{transform: `rotate(${deg}deg)`}}>
                <span className="gd-missile-glow"/><span className="gd-missile-body"/><span
                className="gd-missile-flame"/>
            </div>
        </Marker>
    );
}
