// Builds a single-player match setup from the bundled state-level city data.
// Player is slot 0; opponents are drawn from the great powers.
let _data = null;
export async function loadGameData() {
  if (_data) return _data;
  const [cities, countries] = await Promise.all([
    fetch("/data/cities.json").then((r) => r.json()),
    fetch("/data/countries.json").then((r) => r.json()),
  ]);
  _data = { cities, countries };
  return _data;
}

export const GREAT_POWERS = ["US", "RU", "CN", "IN", "GB", "FR", "DE", "JP", "BR", "KR", "IR", "TR", "SA", "PK", "CA", "AU"];
export const MAX_CITIES_PER_NATION = 60;

export function isoFlag(iso) {
  if (!iso || iso.length !== 2) return "";
  return iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function buildSetup(data, playerIso, opponentCount, seed) {
  const others = GREAT_POWERS.filter((i) => i !== playerIso && data.cities[i]?.length);
  const chosen = [playerIso, ...others].slice(0, Math.min(16, opponentCount + 1))
    .filter((iso) => data.cities[iso]?.length);
  const nations = [], cities = [];
  chosen.forEach((iso, slot) => {
    const cn = data.countries.find((c) => c.iso === iso);
    nations.push({ slot, iso, name: cn?.name || iso, isAi: iso !== playerIso });
    data.cities[iso].forEach((c, i) => {
      cities.push({ id: `${iso}-${i}`, slot, name: c.n, state: c.s, cap: c.cap, pop: c.p, lng: c.lng, lat: c.lat });
    });
  });
  return { mySlot: 0, seed: seed || 1, nations, cities, belligerents: chosen };
}
