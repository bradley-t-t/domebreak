import { Marker, useMap } from "react-map-gl/maplibre";

// A defense-launched homing interceptor, oriented toward the missile it chases.
export default function Interceptor({ it }) {
  const map = useMap().current;
  let deg = 0;
  if (map) {
    const a = map.project([it.lng, it.lat]);
    const b = map.project([it.toLng ?? it.lng, it.toLat ?? it.lat]);
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.5) deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  }
  return (
    <Marker longitude={it.lng} latitude={it.lat} anchor="center">
      <div className="gd-interceptor" style={{ transform: `rotate(${deg}deg)` }}>
        <span className="gd-int-body" />
        <span className="gd-int-flame" />
      </div>
    </Marker>
  );
}
