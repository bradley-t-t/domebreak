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
