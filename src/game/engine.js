// GoldenDome real-time simulation engine. Pure and deterministic given its seed.
// Mutated in place for performance; the React hook re-renders off a version tick.

export const START_POINTS = 450;
export const MISSILE_SPEED = 7; // fallback km per game-second

// Real-scale ballistic speeds (km per game-second): the map uses true km, so
// these match real missiles. Use the speed control (up to 10x) to compress the
// realistic timeline. ICBM ~7 km/s (~Mach 23), hypersonic ~3 km/s (~Mach 9).
export const UNITS = {
  battery:  { label: "MIM-104 Patriot",        kind: "defense", cost: 150, range: 650,   intercept: 0.5,  hp: 50, glyph: "◆" },
  dome:     { label: "Golden Dome",            kind: "defense", cost: 400, range: 380,   intercept: 0.85, hp: 90, glyph: "⬡" },
  radar:    { label: "AN/TPY-2 Radar",         kind: "support", cost: 150, range: 1600,  hp: 40, glyph: "❉" },
  launcher: { label: "Hypersonic Missile",     kind: "offense", cost: 200, range: 6000,  damage: 34, reload: 3.2, speed: 3, hp: 45, glyph: "➤" },
  silo:     { label: "Ballistic Missile (ICBM)", kind: "offense", cost: 320, range: 20000, damage: 55, reload: 6.5, speed: 7, hp: 60, glyph: "▲" },
};

export const UNIT_ICON = { silo: "silo", launcher: "hypersonic", battery: "battery", dome: "dome", radar: "radar" };

// Real missile names per nation for the missile powers; others fall back to the
// generic real-world class label on the unit type.
const MISSILE_NAMES = {
  0:  { silo: "LGM-30 Minuteman III", launcher: "AGM-183 ARRW" },
  1:  { silo: "RS-28 Sarmat",         launcher: "Kh-47M2 Kinzhal" },
  2:  { silo: "DF-41",                launcher: "DF-17" },
  3:  { silo: "Agni-V",               launcher: "BrahMos-II" },
  5:  { silo: "Trident II D5",        launcher: "FC/ASW" },
  6:  { silo: "M51",                  launcher: "ASN4G" },
  13: { silo: "Khorramshahr-4",       launcher: "Fattah-1" },
  15: { silo: "Tayfun",               launcher: "Gokdogan" },
};
export function unitLabel(type, slot) {
  const def = UNITS[type];
  if (def.kind === "offense") return MISSILE_NAMES[slot]?.[type] ?? def.label;
  return def.label;
}

export const TECHS = {
  warheads: { label: "Advanced Warheads", cost: 250, time: 25, desc: "+30% strike damage", apply: (n) => { n.dmgMult *= 1.3; } },
  defense:  { label: "Layered Defense",   cost: 250, time: 25, desc: "+15% intercept",     apply: (n) => { n.interceptAdd += 0.15; } },
  economy:  { label: "War Economy",       cost: 200, time: 20, desc: "+35% income",        apply: (n) => { n.incomeMult *= 1.35; } },
  range:    { label: "Extended Range",    cost: 220, time: 22, desc: "+40% strike range",  apply: (n) => { n.rangeMult *= 1.4; } },
  reload:   { label: "Rapid Reload",      cost: 220, time: 22, desc: "-25% reload time",   apply: (n) => { n.reloadMult *= 0.75; } },
};

export function haversine(aLng, aLat, bLng, bLat) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
function rand(world) {
  let a = world._r | 0;
  a = (a + 0x6D2B79F5) | 0; world._r = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function nextId(world, p) { world._id = (world._id || 0) + 1; return p + world._id; }

export function createWorld(setup) {
  const nations = setup.nations.map((n) => ({
    slot: n.slot, name: n.name, isAi: !!n.isAi, points: START_POINTS, alive: true,
    relations: {}, _ai: 2 + n.slot * 0.3,
    research: { current: null, done: [] },
    dmgMult: 1, interceptAdd: 0, incomeMult: 1, rangeMult: 1, reloadMult: 1,
  }));
  const cities = setup.cities.map((c) => ({
    id: c.id, slot: c.slot, name: c.name, lng: c.lng, lat: c.lat, hp: 100, maxHp: 100, alive: true,
  }));
  return {
    time: 0, speed: 1, paused: true, mySlot: setup.mySlot, seed: setup.seed || 1, _r: (setup.seed || 1) >>> 0,
    _id: 0, nations, cities, units: [], projectiles: [], events: [], winnerSlot: null, over: false,
  };
}

const nationOf = (w, slot) => w.nations.find((n) => n.slot === slot);
export function atWar(w, a, b) {
  if (a === b) return false;
  const n = nationOf(w, a);
  return !!(n && n.relations[b] === "war");
}
export function incomeOf(w, slot) {
  const n = nationOf(w, slot);
  const cityCount = w.cities.filter((c) => c.slot === slot && c.alive).length;
  return (10 + cityCount * 8) * (n?.incomeMult ?? 1);
}
function findTarget(w, id) {
  const c = w.cities.find((x) => x.id === id);
  if (c) return { kind: "city", ref: c, slot: c.slot, get alive() { return c.alive; }, lng: c.lng, lat: c.lat };
  const u = w.units.find((x) => x.id === id);
  if (u) return { kind: "unit", ref: u, slot: u.slot, get alive() { return u.hp > 0; }, lng: u.lng, lat: u.lat };
  return null;
}

export function declareWar(w, a, b) {
  const na = nationOf(w, a), nb = nationOf(w, b);
  if (!na || !nb || a === b) return { error: "invalid" };
  na.relations[b] = "war"; nb.relations[a] = "war";
  return { ok: true };
}
export function makePeace(w, a, b) {
  const na = nationOf(w, a), nb = nationOf(w, b);
  if (na) na.relations[b] = "peace";
  if (nb) nb.relations[a] = "peace";
  return { ok: true };
}
export function buyPlace(w, slot, type, lng, lat) {
  const def = UNITS[type], n = nationOf(w, slot);
  if (!def || !n) return { error: "invalid" };
  if (n.points < def.cost) return { error: "not enough points" };
  n.points -= def.cost;
  const unit = { id: nextId(w, "u"), slot, type, lng, lat, hp: def.hp, cooldown: 0, targetId: null };
  w.units.push(unit);
  return { ok: true, unit };
}
export function commandAttack(w, unitId, targetId) {
  const u = w.units.find((x) => x.id === unitId);
  if (!u) return { error: "gone" };
  if (UNITS[u.type].kind !== "offense") return { error: "not an offensive unit" };
  if (targetId == null) { u.targetId = null; return { ok: true }; }
  const t = findTarget(w, targetId);
  if (!t) return { error: "gone" };
  if (!atWar(w, u.slot, t.slot)) return { error: "not at war with that nation" };
  u.targetId = targetId;
  return { ok: true };
}
export function commandResearch(w, slot, techId) {
  const n = nationOf(w, slot), tech = TECHS[techId];
  if (!n || !tech) return { error: "invalid" };
  if (n.research.done.includes(techId)) return { error: "already researched" };
  if (n.research.current) return { error: "already researching" };
  if (n.points < tech.cost) return { error: "not enough points" };
  n.points -= tech.cost;
  n.research.current = { id: techId, progress: 0 };
  return { ok: true };
}

function launch(w, unit, target) {
  const n = nationOf(w, unit.slot);
  const dist = haversine(unit.lng, unit.lat, target.lng, target.lat);
  w.projectiles.push({
    id: nextId(w, "p"), slot: unit.slot, type: unit.type, damage: UNITS[unit.type].damage * (n?.dmgMult ?? 1),
    speed: UNITS[unit.type].speed ?? MISSILE_SPEED,
    fromLng: unit.lng, fromLat: unit.lat, toLng: target.lng, toLat: target.lat,
    lng: unit.lng, lat: unit.lat, targetId: target.ref.id, dist, travelled: 0, progress: 0,
  });
}
function resolveImpact(w, p) {
  const target = findTarget(w, p.targetId);
  if (!target || !target.alive) { w.events.push({ id: nextId(w, "e"), t: w.time, type: "fizzle", lng: p.toLng, lat: p.toLat }); return; }
  const defNation = nationOf(w, target.slot);
  const defenders = w.units.filter((u) => u.slot === target.slot && UNITS[u.type].kind === "defense" && u.hp > 0);
  let survival = 1;
  for (const d of defenders) {
    if (haversine(d.lng, d.lat, target.lng, target.lat) <= UNITS[d.type].range) {
      survival *= 1 - Math.min(0.97, UNITS[d.type].intercept + (defNation?.interceptAdd ?? 0));
    }
  }
  if (rand(w) < 1 - survival) { w.events.push({ id: nextId(w, "e"), t: w.time, type: "intercept", cityId: target.ref.id, lng: target.lng, lat: target.lat }); return; }
  target.ref.hp -= p.damage;
  const dead = target.ref.hp <= 0;
  if (dead) { target.ref.hp = 0; if (target.kind === "city") target.ref.alive = false; }
  w.events.push({ id: nextId(w, "e"), t: w.time, type: dead ? "destroy" : "hit", kind: target.kind, cityId: target.ref.id, lng: target.lng, lat: target.lat, slot: p.slot });
}

function aiTick(w, dt) {
  for (const n of w.nations) {
    if (!n.isAi || !n.alive) continue;
    n._ai -= dt;
    if (n._ai > 0) continue;
    n._ai = 3 + rand(w) * 3;
    const enemies = w.nations.filter((e) => e.alive && atWar(w, n.slot, e.slot));
    const myCap = w.cities.find((c) => c.slot === n.slot && c.alive);
    if (!myCap) continue;
    const domes = w.units.filter((u) => u.slot === n.slot && u.type === "dome").length;
    if (domes === 0 && n.points >= UNITS.dome.cost) { buyPlace(w, n.slot, "dome", myCap.lng, myCap.lat); return; }
    if (!n.research.current && n.points >= 300) {
      const undone = Object.keys(TECHS).filter((t) => !n.research.done.includes(t));
      if (undone.length && rand(w) < 0.5) { commandResearch(w, n.slot, undone[Math.floor(rand(w) * undone.length)]); return; }
    }
    if (!enemies.length) continue;
    if (n.points >= UNITS.silo.cost) {
      const r = buyPlace(w, n.slot, "silo", myCap.lng + (rand(w) - 0.5) * 2, myCap.lat + (rand(w) - 0.5) * 2);
      const targets = w.cities.filter((c) => c.alive && enemies.some((e) => e.slot === c.slot));
      if (r.ok && targets.length) commandAttack(w, r.unit.id, targets[Math.floor(rand(w) * targets.length)].id);
    }
  }
}

export function step(w, dt) {
  if (w.over || dt <= 0) return w;
  w.time += dt;
  for (const n of w.nations) if (n.alive) n.points += incomeOf(w, n.slot) * dt;

  for (const n of w.nations) {
    if (!n.alive || !n.research.current) continue;
    n.research.current.progress += dt / TECHS[n.research.current.id].time;
    if (n.research.current.progress >= 1) {
      TECHS[n.research.current.id].apply(n);
      n.research.done.push(n.research.current.id);
      n.research.current = null;
    }
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
        launch(w, u, t); u.cooldown = def.reload * (n?.reloadMult ?? 1);
      }
    }
  }

  for (const p of w.projectiles) {
    p.travelled += (p.speed ?? MISSILE_SPEED) * dt;
    p.progress = Math.min(1, p.travelled / (p.dist || 1));
    p.lng = p.fromLng + (p.toLng - p.fromLng) * p.progress;
    p.lat = p.fromLat + (p.toLat - p.fromLat) * p.progress;
    if (p.progress >= 1) { resolveImpact(w, p); p._dead = true; }
  }
  w.projectiles = w.projectiles.filter((p) => !p._dead);
  w.units = w.units.filter((u) => u.hp > 0);
  if (w.events.length > 60) w.events.splice(0, w.events.length - 60);

  aiTick(w, dt);

  for (const n of w.nations) {
    if (n.alive && !w.cities.some((c) => c.slot === n.slot && c.alive)) n.alive = false;
  }
  const alive = w.nations.filter((n) => n.alive);
  if (alive.length <= 1) { w.over = true; w.winnerSlot = alive[0]?.slot ?? null; w.paused = true; }
  return w;
}
