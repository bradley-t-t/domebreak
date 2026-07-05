// Geodesic helpers shared by the sim engine and the map overlays.

export function circle(lng, lat, km, steps = 56) {
  const dLat = km / 111;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    coords.push([lng + (dLat / Math.cos((lat * Math.PI) / 180)) * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export function bearing(lng1, lat1, lng2, lat2) {
  const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Great-circle intermediate point at fraction f (0..1). Correct geodesic path on
// both the globe and mercator, unlike naive lng/lat interpolation.
export function interpGC(lng1, lat1, lng2, lat2, f) {
  const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
  const la1 = toRad(lat1), lo1 = toRad(lng1), la2 = toRad(lat2), lo2 = toRad(lng2);
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2)));
  if (d < 1e-9) return [lng1, lat1];
  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(la1) * Math.cos(lo1) + b * Math.cos(la2) * Math.cos(lo2);
  const y = a * Math.cos(la1) * Math.sin(lo1) + b * Math.cos(la2) * Math.sin(lo2);
  const z = a * Math.sin(la1) + b * Math.sin(la2);
  return [toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))];
}

// Polyline of great-circle points from 0..progress, so trails curve correctly.
export function gcTrail(lng1, lat1, lng2, lat2, progress, steps = 24) {
  const pts = [];
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const p = interpGC(lng1, lat1, lng2, lat2, (progress * i) / steps);
    // Unwrap longitude so a pole-crossing path never jumps +/-360 (which would
    // otherwise draw a stray loop/line across the map near the poles).
    if (prev) { while (p[0] - prev[0] > 180) p[0] -= 360; while (p[0] - prev[0] < -180) p[0] += 360; }
    pts.push(p); prev = p;
  }
  return pts;
}
