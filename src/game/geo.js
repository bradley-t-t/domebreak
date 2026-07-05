// Approximate geodesic circle as a polygon ring for range visualization.
export function circle(lng, lat, km, steps = 56) {
  const dLat = km / 111;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    coords.push([lng + (dLat / Math.cos((lat * Math.PI) / 180)) * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

// Initial great-circle bearing (deg, 0=north, clockwise) — orients missiles.
export function bearing(lng1, lat1, lng2, lat2) {
  const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
