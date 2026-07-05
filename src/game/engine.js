// GoldenDome real-time simulation engine. Pure and deterministic given its seed:
// the same seed + same commands + same dt sequence always produce the same world.
// That lets it run identically in the browser rAF loop and in headless tests.
// The world is mutated in place for performance; the React hook re-renders off a
// version counter rather than cloning each frame.

export const START_POINTS = 450;
export const MISSILE_SPEED = 1400; // km per game-second

export const UNITS = {
  battery:  { label: "Interceptor Battery", kind: "defense", cost: 150, range: 650,   intercept: 0.5,  hp: 50, glyph: "◆" },
  dome:     { label: "Golden Dome",         kind: "defense", cost: 400, range: 380,   intercept: 0.85, hp: 90, glyph: "⬡" },
  radar:    { label: "Radar",               kind: "support", cost: 150, range: 1600,  hp: 40, glyph: "❉" },
  launcher: { label: "Cruise Launcher",     kind: "offense", cost: 200, range: 3800,  damage: 34, reload: 3.2, hp: 45, glyph: "➤" },
  silo:     { label: "Missile Silo",        kind: "offense", cost: 320, range: 20000, damage: 55, reload: 6.5, hp: 60, glyph: "▲" },
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
  const cityCount = w.cities.filter((c) => c.slot === slot && c.alive).length;
  return 10 + cityCount * 8;
}
function findTarget(w, id) {
  const c = w.cities.find((x) => x.id === id);
  if (c) return { kind: "city", ref: c, slot: c.slot, get alive() { return c.alive; }, lng: c.lng, lat: c.lat };
  const u = w.units.find((x) => x.id === id);
  if (u) return { kind: "unit", ref: u, slot: u.slot, get alive() { return u.hp > 0; }, lng: u.lng, lat: u.lat };
  return null;
}

// ---- commands ----
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
  const t = findTarget(w, targetId);
  if (!u || !t) return { error: "gone" };
  if (UNITS[u.type].kind !== "offense") return { error: "not an offensive unit" };
  if (!atWar(w, u.slot, t.slot)) return { error: "not at war with that nation" };
  u.targetId = targetId;
  return { ok: true };
}

function launch(w, unit, target) {
  const dist = haversine(unit.lng, unit.lat, target.lng, target.lat);
  w.projectiles.push({
    id: nextId(w, "p"), slot: unit.slot, damage: UNITS[unit.type].damage,
    fromLng: unit.lng, fromLat: unit.lat, toLng: target.lng, toLat: target.lat,
    lng: unit.lng, lat: unit.lat, targetId: target.ref.id, dist, travelled: 0, progress: 0,
  });
}
function resolveImpact(w, p) {
  const target = findTarget(w, p.targetId);
  if (!target || !target.alive) { w.events.push({ t: w.time, type: "fizzle", lng: p.toLng, lat: p.toLat }); return; }
  const defenders = w.units.filter((u) => u.slot === target.slot && UNITS[u.type].kind === "defense" && u.hp > 0);
  let survival = 1;
  for (const d of defenders) {
    if (haversine(d.lng, d.lat, target.lng, target.lat) <= UNITS[d.type].range) survival *= 1 - UNITS[d.type].intercept;
  }
  if (rand(w) < 1 - survival) { w.events.push({ t: w.time, type: "intercept", lng: target.lng, lat: target.lat }); return; }
  target.ref.hp -= p.damage;
  const dead = target.ref.hp <= 0;
  if (dead) { target.ref.hp = 0; if (target.kind === "city") target.ref.alive = false; }
  w.events.push({ t: w.time, type: dead ? "destroy" : "hit", kind: target.kind, lng: target.lng, lat: target.lat, slot: p.slot });
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

  for (const u of w.units) {
    if (u.hp <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);
    const def = UNITS[u.type];
    if (def.kind === "offense" && u.targetId && u.cooldown <= 0) {
      const t = findTarget(w, u.targetId);
      if (!t || !t.alive || !atWar(w, u.slot, t.slot)) { u.targetId = null; continue; }
      if (haversine(u.lng, u.lat, t.lng, t.lat) <= def.range) { launch(w, u, t); u.cooldown = def.reload; }
    }
  }

  for (const p of w.projectiles) {
    p.travelled += MISSILE_SPEED * dt;
    p.progress = Math.min(1, p.travelled / (p.dist || 1));
    p.lng = p.fromLng + (p.toLng - p.fromLng) * p.progress;
    p.lat = p.fromLat + (p.toLat - p.fromLat) * p.progress;
    if (p.progress >= 1) { resolveImpact(w, p); p._dead = true; }
  }
  w.projectiles = w.projectiles.filter((p) => !p._dead);
  w.units = w.units.filter((u) => u.hp > 0);
  if (w.events.length > 40) w.events.splice(0, w.events.length - 40);

  aiTick(w, dt);

  for (const n of w.nations) {
    if (n.alive && !w.cities.some((c) => c.slot === n.slot && c.alive)) n.alive = false;
  }
  const alive = w.nations.filter((n) => n.alive);
  if (alive.length <= 1) { w.over = true; w.winnerSlot = alive[0]?.slot ?? null; w.paused = true; }
  return w;
}
