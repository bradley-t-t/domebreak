import { Marker, useMap } from "react-map-gl/maplibre";
import { bearing } from "../game/geo.js";

// Orients the missile in screen space: nose points from its current projected
// position toward the projected target, so it faces both the target and its
// on-screen path direction regardless of globe/mercator projection.
export default function Missile({ p }) {
  const map = useMap().current;
  let deg;
  if (map) {
    const a = map.project([p.lng, p.lat]);
    const b = map.project([p.toLng, p.toLat]);
    deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  } else {
    deg = bearing(p.fromLng, p.fromLat, p.toLng, p.toLat);
  }
  return (
    <Marker longitude={p.lng} latitude={p.lat} anchor="center">
      <div className="gd-missile" style={{ transform: `rotate(${deg}deg)` }}>
        <span className="gd-missile-glow" />
        <span className="gd-missile-body" />
        <span className="gd-missile-flame" />
      </div>
    </Marker>
  );
}
