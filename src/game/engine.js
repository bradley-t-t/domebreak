// GoldenDome real-time simulation engine. Pure and deterministic given its seed.
import { interpGC } from "./geo.js";

export const START_POINTS = 500;
export const MISSILE_SPEED = 140;
export const INTERCEPTOR_SPEED = 520;
export const RADAR_RANGE_MULT = 2.5;
export const TERRITORY_RADIUS = 550;
export const MOVE_COST_FRAC = 0.25;
export const MIN_SEP = 45;

export const UNITS = {
  battery:  { label: "MIM-104 Patriot",          kind: "defense", cost: 150, range: 320,   intercept: 0.5,  reload: 3,   fireCost: 12, hp: 50, upkeep: 1,   glyph: "◆" },
  dome:     { label: "Golden Dome",              kind: "defense", cost: 400, range: 250,   intercept: 0.85, reload: 4.5, fireCost: 22, hp: 90, upkeep: 3,   glyph: "⬡" },
  radar:    { label: "AN/TPY-2 Radar",           kind: "support", cost: 150, range: 1500,  hp: 40, upkeep: 1.5, glyph: "❉" },
  launcher: { label: "Hypersonic Missile",       kind: "offense", cost: 200, range: 6000,  damage: 34, reload: 3.2, fireCost: 22, speed: 60,  hp: 45, upkeep: 2, glyph: "➤" },
  silo:     { label: "Ballistic Missile (ICBM)", kind: "offense", cost: 320, range: 20000, damage: 55, reload: 6.5, fireCost: 45, speed: 140, hp: 60, upkeep: 4, glyph: "▲" },
};
export const UNIT_ICON = { silo: "silo", launcher: "hypersonic", battery: "battery", dome: "dome", radar: "radar" };

const MISSILE_NAMES = {
  0: { silo: "LGM-30 Minuteman III", launcher: "AGM-183 ARRW" }, 1: { silo: "RS-28 Sarmat", launcher: "Kh-47M2 Kinzhal" },
  2: { silo: "DF-41", launcher: "DF-17" }, 3: { silo: "Agni-V", launcher: "BrahMos-II" },
  5: { silo: "Trident II D5", launcher: "FC/ASW" }, 6: { silo: "M51", launcher: "ASN4G" },
  13: { silo: "Khorramshahr-4", launcher: "Fattah-1" }, 15: { silo: "Tayfun", launcher: "Gokdogan" },
};
export function unitLabel(type, slot) { const def = UNITS[type]; if (def.kind === "offense") return MISSILE_NAMES[slot]?.[type] ?? def.label; return def.label; }

export const TECH_PATHS = [
  { id: "off", name: "Strategic Command", glyph: "▲" }, { id: "def", name: "Aegis Program", glyph: "⬡" },
  { id: "eco", name: "War Economy", glyph: "$" }, { id: "det", name: "Early Warning", glyph: "❉" }, { id: "cmd", name: "Command & Control", glyph: "✦" },
];
function chain(path, defs) { const out = {}; defs.forEach((d, i) => { out[`${path}${i + 1}`] = { path, tier: i + 1, req: i ? `${path}${i}` : null, ...d }; }); return out; }
export const TECHS = {
  ...chain("off", [
    { name: "Improved Warheads", desc: "+20% strike damage", cost: 220, time: 20, apply: (n) => (n.dmgMult *= 1.2) },
    { name: "Heavy Warheads", desc: "+20% strike damage", cost: 300, time: 24, apply: (n) => (n.dmgMult *= 1.2) },
    { name: "Extended Boosters", desc: "+30% missile range", cost: 340, time: 26, apply: (n) => (n.rangeMult *= 1.3) },
    { name: "Rapid Reload", desc: "-20% reload time", cost: 380, time: 28, apply: (n) => (n.reloadMult *= 0.8) },
    { name: "MIRV Technology", desc: "+25% strike damage", cost: 460, time: 32, apply: (n) => (n.dmgMult *= 1.25) },
    { name: "Doomsday Arsenal", desc: "+30% strike damage", cost: 560, time: 38, apply: (n) => (n.dmgMult *= 1.3) },
  ]),
  ...chain("def", [
    { name: "Interceptor Mk II", desc: "+10% intercept", cost: 220, time: 20, apply: (n) => (n.interceptAdd += 0.1) },
    { name: "Layered Defense", desc: "+10% intercept", cost: 300, time: 24, apply: (n) => (n.interceptAdd += 0.1) },
    { name: "Wide-Area Coverage", desc: "+30% defense range", cost: 340, time: 26, apply: (n) => (n.defRangeMult *= 1.3) },
    { name: "Fast Interceptors", desc: "+30% interceptor speed", cost: 380, time: 28, apply: (n) => (n.interceptorSpeedMult *= 1.3) },
    { name: "Directed Energy", desc: "+12% intercept", cost: 460, time: 32, apply: (n) => (n.interceptAdd += 0.12) },
    { name: "Golden Dome Doctrine", desc: "+35% defense range", cost: 560, time: 38, apply: (n) => (n.defRangeMult *= 1.35) },
  ]),
  ...chain("eco", [
    { name: "War Bonds", desc: "+20% income", cost: 180, time: 18, apply: (n) => (n.incomeMult *= 1.2) },
    { name: "Industrial Base", desc: "+20% income", cost: 260, time: 22, apply: (n) => (n.incomeMult *= 1.2) },
    { name: "Mass Production", desc: "-15% build cost", cost: 320, time: 24, apply: (n) => (n.buildCostMult *= 0.85) },
    { name: "Efficient Logistics", desc: "-20% upkeep", cost: 360, time: 26, apply: (n) => (n.upkeepMult *= 0.8) },
    { name: "Strategic Reserves", desc: "+25% income", cost: 440, time: 30, apply: (n) => (n.incomeMult *= 1.25) },
    { name: "Total War Economy", desc: "-20% build cost", cost: 540, time: 36, apply: (n) => (n.buildCostMult *= 0.8) },
  ]),
  ...chain("det", [
    { name: "Long-Range Radar", desc: "+30% radar coverage", cost: 200, time: 18, apply: (n) => (n.radarMult *= 1.3) },
    { name: "Over-the-Horizon", desc: "+30% radar coverage", cost: 280, time: 22, apply: (n) => (n.radarMult *= 1.3) },
    { name: "Satellite Recon", desc: "+20% defense range", cost: 340, time: 26, apply: (n) => (n.defRangeMult *= 1.2) },
    { name: "Advanced Tracking", desc: "+15% intercept", cost: 400, time: 28, apply: (n) => (n.interceptAdd += 0.15) },
    { name: "Missile Warning Net", desc: "+30% interceptor speed", cost: 460, time: 32, apply: (n) => (n.interceptorSpeedMult *= 1.3) },
    { name: "Global Surveillance", desc: "+40% radar coverage", cost: 560, time: 38, apply: (n) => (n.radarMult *= 1.4) },
  ]),
  ...chain("cmd", [
    { name: "R&D Investment", desc: "+25% research speed", cost: 180, time: 16, apply: (n) => (n.researchSpeedMult *= 1.25) },
    { name: "Think Tanks", desc: "+25% research speed", cost: 260, time: 20, apply: (n) => (n.researchSpeedMult *= 1.25) },
    { name: "Mobile Launchers", desc: "-40% relocation cost", cost: 320, time: 24, apply: (n) => (n.moveCostMult *= 0.6) },
    { name: "Rapid Deployment", desc: "-15% build cost", cost: 380, time: 26, apply: (n) => (n.buildCostMult *= 0.85) },
    { name: "Civil Defense", desc: "+20% income", cost: 440, time: 30, apply: (n) => (n.incomeMult *= 1.2) },
    { name: "Grand Strategy", desc: "+15% damage, +10% intercept", cost: 600, time: 40, apply: (n) => { n.dmgMult *= 1.15; n.interceptAdd += 0.1; } },
  ]),
};

export function haversine(aLng, aLat, bLng, bLat) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
function rand(world) { let a = world._r | 0; a = (a + 0x6D2B79F5) | 0; world._r = a; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function nextId(world, p) { world._id = (world._id || 0) + 1; return p + world._id; }

export function createWorld(setup) {
  const nations = setup.nations.map((n) => ({
    slot: n.slot, name: n.name, iso: n.iso, isAi: !!n.isAi, points: START_POINTS, alive: true, relations: {}, _ai: 2 + n.slot * 0.3,
    research: { queue: [], current: null, done: [] },
    dmgMult: 1, interceptAdd: 0, incomeMult: 1, rangeMult: 1, reloadMult: 1, defRangeMult: 1, radarMult: 1, interceptorSpeedMult: 1, buildCostMult: 1, upkeepMult: 1, researchSpeedMult: 1, moveCostMult: 1,
  }));
  const cities = setup.cities.map((c) => ({ id: c.id, slot: c.slot, name: c.name, state: c.state || "", cap: c.cap ? 1 : 0, pop: c.pop || 0, lng: c.lng, lat: c.lat, hp: c.cap ? 140 : 100, maxHp: c.cap ? 140 : 100, alive: true }));
  return { time: 0, speed: 1, paused: true, mySlot: setup.mySlot, seed: setup.seed || 1, _r: (setup.seed || 1) >>> 0, _id: 0, nations, cities, units: [], projectiles: [], interceptors: [], events: [], winnerSlot: null, over: false };
}

const nationOf = (w, slot) => w.nations.find((n) => n.slot === slot);
export function atWar(w, a, b) { if (a === b) return false; const n = nationOf(w, a); return !!(n && n.relations[b] === "war"); }
export function incomeOf(w, slot) { const n = nationOf(w, slot); const cityCount = w.cities.filter((c) => c.slot === slot && c.alive).length; return (8 + cityCount * 2) * (n?.incomeMult ?? 1); }
export function upkeepOf(w, slot) { const n = nationOf(w, slot); let sum = 0; for (const u of w.units) if (u.slot === slot && u.hp > 0) sum += UNITS[u.type].upkeep ?? 0; return sum * (n?.upkeepMult ?? 1); }
export function netIncomeOf(w, slot) { return incomeOf(w, slot) - upkeepOf(w, slot); }
export function populationOf(w, slot) { let p = 0; for (const c of w.cities) if (c.slot === slot && c.alive) p += c.pop || 0; return p; }
export function inTerritory(w, slot, lng, lat) { return w.cities.some((c) => c.slot === slot && c.alive && haversine(c.lng, c.lat, lng, lat) <= TERRITORY_RADIUS); }
export function radarLinked(w, d) { const n = nationOf(w, d.slot); const link = UNITS.radar.range * (n?.radarMult ?? 1); return w.units.some((r) => r.type === "radar" && r.slot === d.slot && r.hp > 0 && haversine(r.lng, r.lat, d.lng, d.lat) <= link); }
export function defenseRange(w, d) { const base = UNITS[d.type].range; if (UNITS[d.type].kind !== "defense") return base; const n = nationOf(w, d.slot); return base * (radarLinked(w, d) ? RADAR_RANGE_MULT : 1) * (n?.defRangeMult ?? 1); }

function findTarget(w, id) {
  const c = w.cities.find((x) => x.id === id);
  if (c) return { kind: "city", ref: c, slot: c.slot, get alive() { return c.alive; }, lng: c.lng, lat: c.lat };
  const u = w.units.find((x) => x.id === id);
  if (u) return { kind: "unit", ref: u, slot: u.slot, get alive() { return u.hp > 0; }, lng: u.lng, lat: u.lat };
  return null;
}

export function declareWar(w, a, b) { const na = nationOf(w, a), nb = nationOf(w, b); if (!na || !nb || a === b) return { error: "invalid" }; na.relations[b] = "war"; nb.relations[a] = "war"; return { ok: true }; }
export function makePeace(w, a, b) { const na = nationOf(w, a), nb = nationOf(w, b); if (na) na.relations[b] = "peace"; if (nb) nb.relations[a] = "peace"; return { ok: true }; }
export function placementBlocked(w, lng, lat, ignoreUnitId) {
  if (w.cities.some((c) => haversine(c.lng, c.lat, lng, lat) < MIN_SEP)) return "too close to a city";
  if (w.units.some((u) => u.id !== ignoreUnitId && u.hp > 0 && haversine(u.lng, u.lat, lng, lat) < MIN_SEP)) return "too close to another unit";
  return null;
}
export function buyPlace(w, slot, type, lng, lat) {
  const def = UNITS[type], n = nationOf(w, slot);
  if (!def || !n) return { error: "invalid" };
  if (netIncomeOf(w, slot) < 0) return { error: "cannot build while in deficit" };
  if (!inTerritory(w, slot, lng, lat)) return { error: "outside your territory" };
  const blocked = placementBlocked(w, lng, lat, null); if (blocked) return { error: blocked };
  const cost = Math.round(def.cost * (n.buildCostMult ?? 1));
  if (n.points < cost) return { error: "not enough points" };
  n.points -= cost;
  const unit = { id: nextId(w, "u"), slot, type, lng, lat, hp: def.hp, cooldown: 0, targetId: null };
  w.units.push(unit); return { ok: true, unit };
}
export function moveUnit(w, slot, unitId, lng, lat) {
  const u = w.units.find((x) => x.id === unitId && x.slot === slot); if (!u) return { error: "not found" };
  if (!inTerritory(w, slot, lng, lat)) return { error: "outside your territory" };
  const blocked = placementBlocked(w, lng, lat, unitId); if (blocked) return { error: blocked };
  const n = nationOf(w, slot);
  const cost = Math.round(UNITS[u.type].cost * MOVE_COST_FRAC * (n.moveCostMult ?? 1));
  if (n.points < cost) return { error: "not enough points to relocate" };
  n.points -= cost; u.lng = lng; u.lat = lat; return { ok: true, cost };
}
export function scrapUnit(w, slot, unitId) { const i = w.units.findIndex((u) => u.id === unitId && u.slot === slot); if (i < 0) return { error: "not found" }; const u = w.units[i]; const n = nationOf(w, slot); if (n) n.points += Math.floor((UNITS[u.type].cost || 0) / 2); w.units.splice(i, 1); return { ok: true }; }
export function commandAttack(w, unitId, targetId) {
  const u = w.units.find((x) => x.id === unitId); if (!u) return { error: "gone" };
  if (UNITS[u.type].kind !== "offense") return { error: "not an offensive unit" };
  if (targetId == null) { u.targetId = null; return { ok: true }; }
  const t = findTarget(w, targetId); if (!t) return { error: "gone" };
  if (!atWar(w, u.slot, t.slot)) return { error: "not at war with that nation" };
  u.targetId = targetId; return { ok: true };
}
export function canQueue(n, techId) { const t = TECHS[techId]; if (!t) return false; if (n.research.done.includes(techId) || n.research.queue.includes(techId) || n.research.current?.id === techId) return false; if (!t.req) return true; return n.research.done.includes(t.req) || n.research.queue.includes(t.req) || n.research.current?.id === t.req; }
export function enqueueResearch(w, slot, techId) { const n = nationOf(w, slot), t = TECHS[techId]; if (!n || !t) return { error: "invalid" }; if (!canQueue(n, techId)) return { error: "unavailable" }; if (n.points < t.cost) return { error: "not enough points" }; n.points -= t.cost; n.research.queue.push(techId); return { ok: true }; }
export function unqueueResearch(w, slot, techId) { const n = nationOf(w, slot); const i = n.research.queue.indexOf(techId); if (i < 0) return { error: "not queued" }; const dep = n.research.queue.slice(i + 1).filter((q) => TECHS[q].req === techId); if (dep.length) return { error: "later tech depends on it" }; n.research.queue.splice(i, 1); n.points += TECHS[techId].cost; return { ok: true }; }

function launch(w, unit, target) {
  const n = nationOf(w, unit.slot);
  const dist = haversine(unit.lng, unit.lat, target.lng, target.lat);
  w.projectiles.push({ id: nextId(w, "p"), slot: unit.slot, type: unit.type, damage: UNITS[unit.type].damage * (n?.dmgMult ?? 1), speed: UNITS[unit.type].speed ?? MISSILE_SPEED, tried: [], altNorm: 0, fromLng: unit.lng, fromLat: unit.lat, toLng: target.lng, toLat: target.lat, lng: unit.lng, lat: unit.lat, aheadLng: unit.lng, aheadLat: unit.lat, targetId: target.ref.id, dist, travelled: 0, progress: 0 });
}
function resolveHit(w, p) {
  const target = findTarget(w, p.targetId);
  if (!target || !target.alive) { w.events.push({ id: nextId(w, "e"), t: w.time, type: "fizzle", lng: p.toLng, lat: p.toLat }); return; }
  target.ref.hp -= p.damage; const dead = target.ref.hp <= 0;
  if (dead) { target.ref.hp = 0; if (target.kind === "city") target.ref.alive = false; }
  w.events.push({ id: nextId(w, "e"), t: w.time, type: dead ? "destroy" : "hit", kind: target.kind, cityId: target.ref.id, lng: target.lng, lat: target.lat, slot: p.slot });
}
// Weighted-by-population target pick (prefers populous enemy cities; skips pop-0 when possible).
function pickTarget(w, enemies) {
  const en = new Set(enemies.map((e) => e.slot));
  let pool = w.cities.filter((c) => c.alive && en.has(c.slot) && (c.pop || 0) > 0);
  if (!pool.length) pool = w.cities.filter((c) => c.alive && en.has(c.slot));
  if (!pool.length) return null;
  const total = pool.reduce((s, c) => s + (c.pop || 1), 0);
  let r = rand(w) * total;
  for (const c of pool) { r -= (c.pop || 1); if (r <= 0) return c; }
  return pool[pool.length - 1];
}

function aiSpot(w, slot, city) {
  for (let k = 0; k < 10; k++) {
    const lng = city.lng + (rand(w) - 0.5) * 2.4, lat = city.lat + (rand(w) - 0.5) * 2.4;
    if (inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return { lng, lat };
  }
  return null;
}
function aiTick(w, dt) {
  for (const n of w.nations) {
    if (!n.isAi || !n.alive) continue;
    n._ai -= dt; if (n._ai > 0) continue; n._ai = 3 + rand(w) * 3;
    const enemies = w.nations.filter((e) => e.alive && atWar(w, n.slot, e.slot));
    const myCap = w.cities.find((c) => c.slot === n.slot && c.alive); if (!myCap) continue;
    const domes = w.units.filter((u) => u.slot === n.slot && u.type === "dome").length;
    if (domes === 0 && n.points >= UNITS.dome.cost) { const p = aiSpot(w, n.slot, myCap); if (p && buyPlace(w, n.slot, "dome", p.lng, p.lat).ok) return; }
    const radars = w.units.filter((u) => u.slot === n.slot && u.type === "radar").length;
    if (domes > 0 && radars === 0 && n.points >= UNITS.radar.cost + 100) { const p = aiSpot(w, n.slot, myCap); if (p && buyPlace(w, n.slot, "radar", p.lng, p.lat).ok) return; }
    if (!n.research.current && !n.research.queue.length && n.points >= 350) { const avail = Object.keys(TECHS).filter((t) => canQueue(n, t)); if (avail.length && rand(w) < 0.55) { enqueueResearch(w, n.slot, avail[Math.floor(rand(w) * avail.length)]); return; } }
    if (!enemies.length) continue;
    if (n.points >= UNITS.silo.cost + 200 && netIncomeOf(w, n.slot) > 3) {
      const p = aiSpot(w, n.slot, myCap); if (!p) continue;
      const r = buyPlace(w, n.slot, "silo", p.lng, p.lat);
      const tgt = pickTarget(w, enemies);
      if (r.ok && tgt) commandAttack(w, r.unit.id, tgt.id);
    }
  }
}

export function step(w, dt) {
  if (w.over || dt <= 0) return w;
  w.time += dt;
  for (const n of w.nations) if (n.alive) n.points = Math.max(0, n.points + netIncomeOf(w, n.slot) * dt);

  for (const n of w.nations) {
    if (!n.alive) continue; const rr = n.research;
    if (!rr.current && rr.queue.length) rr.current = { id: rr.queue.shift(), progress: 0 };
    if (rr.current) { rr.current.progress += (dt / TECHS[rr.current.id].time) * (n.researchSpeedMult ?? 1); if (rr.current.progress >= 1) { TECHS[rr.current.id].apply(n); rr.done.push(rr.current.id); rr.current = null; } }
  }

  for (const u of w.units) {
    if (u.hp <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);
    const def = UNITS[u.type];
    if (def.kind === "offense" && u.targetId && u.cooldown <= 0) {
      const t = findTarget(w, u.targetId);
      if (!t || !t.alive || !atWar(w, u.slot, t.slot)) { u.targetId = null; continue; }
      const n = nationOf(w, u.slot);
      if (haversine(u.lng, u.lat, t.lng, t.lat) <= def.range * (n?.rangeMult ?? 1)) {
        if (n.points >= (def.fireCost || 0)) { n.points -= def.fireCost || 0; launch(w, u, t); u.cooldown = def.reload * (n?.reloadMult ?? 1); }
      }
    }
  }

  for (const p of w.projectiles) {
    p.travelled += (p.speed ?? MISSILE_SPEED) * dt;
    p.progress = Math.min(1, p.travelled / (p.dist || 1));
    const pos = interpGC(p.fromLng, p.fromLat, p.toLng, p.toLat, p.progress); p.lng = pos[0]; p.lat = pos[1];
    const ah = interpGC(p.fromLng, p.fromLat, p.toLng, p.toLat, Math.min(1, p.progress + 0.03)); p.aheadLng = ah[0]; p.aheadLat = ah[1];
    p.altNorm = Math.sin(p.progress * Math.PI);
    // Defenses fire interceptors (gated by reload + points). Interceptors resolve their hit roll on contact.
    for (const d of w.units) {
      if (d.hp <= 0 || UNITS[d.type].kind !== "defense") continue;
      if (d.slot === p.slot || d.cooldown > 0 || p.tried.includes(d.id)) continue;
      if (haversine(d.lng, d.lat, p.lng, p.lat) <= defenseRange(w, d)) {
        const dn = nationOf(w, d.slot); const fc = UNITS[d.type].fireCost || 0;
        if (dn.points < fc) continue; // cannot fire without money
        p.tried.push(d.id); dn.points -= fc; d.cooldown = UNITS[d.type].reload || 3;
        w.interceptors.push({ id: nextId(w, "i"), slot: d.slot, targetId: p.id, hitProb: Math.min(0.97, UNITS[d.type].intercept + (dn.interceptAdd ?? 0)), speed: INTERCEPTOR_SPEED * (dn.interceptorSpeedMult ?? 1), altNorm: 0, launchDist: Math.max(1, haversine(d.lng, d.lat, p.lng, p.lat)), fromLng: d.lng, fromLat: d.lat, lng: d.lng, lat: d.lat, toLng: p.lng, toLat: p.lat });
      }
    }
    if (!p._dead && p.progress >= 1) { resolveHit(w, p); p._dead = true; }
  }

  for (const it of w.interceptors) {
    const tgt = w.projectiles.find((p) => p.id === it.targetId && !p._dead);
    if (!tgt) { it._dead = true; continue; }
    it.toLng = tgt.lng; it.toLat = tgt.lat;
    const dist = haversine(it.lng, it.lat, tgt.lng, tgt.lat); const stepKm = it.speed * dt;
    it.altNorm = (tgt.altNorm ?? 0) * Math.min(1, Math.max(0, 1 - dist / (it.launchDist || 1)));
    if (dist <= Math.max(50, stepKm)) {
      it._dead = true;
      if (rand(w) < (it.hitProb ?? 0.8)) { tgt._dead = true; w.events.push({ id: nextId(w, "e"), t: w.time, type: "intercept", lng: tgt.lng, lat: tgt.lat, alt: tgt.altNorm ?? 0, byLng: it.fromLng, byLat: it.fromLat }); }
      else { w.events.push({ id: nextId(w, "e"), t: w.time, type: "miss", lng: it.lng, lat: it.lat, alt: it.altNorm ?? 0 }); }
    } else { const f = stepKm / dist; it.lng += (tgt.lng - it.lng) * f; it.lat += (tgt.lat - it.lat) * f; }
  }

  w.interceptors = w.interceptors.filter((it) => !it._dead);
  w.projectiles = w.projectiles.filter((p) => !p._dead);
  w.units = w.units.filter((u) => u.hp > 0);
  if (w.events.length > 60) w.events.splice(0, w.events.length - 60);

  aiTick(w, dt);
  for (const n of w.nations) if (n.alive && !w.cities.some((c) => c.slot === n.slot && c.alive)) n.alive = false;
  const alive = w.nations.filter((n) => n.alive);
  if (alive.length <= 1) { w.over = true; w.winnerSlot = alive[0]?.slot ?? null; w.paused = true; }
  return w;
}
