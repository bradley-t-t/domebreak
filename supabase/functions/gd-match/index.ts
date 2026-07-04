// GoldenDome match service. Server-authoritative: every mutation runs here with
// the service-role key after validating the caller's player secret. Combat is a
// deterministic, seeded simulation so both clients replay an identical exchange.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COST: Record<string, number> = { silo: 300, interceptor: 200, radar: 150, dome: 400 };
const WARHEAD_DAMAGE = 60;
const R = { interceptor: 700, radar: 1400, dome: 300 }; // km
const P = { interceptor: 0.45, dome: 0.6, radarBoost: 0.12, capInterceptor: 0.7 };

// Two home nations, thematically opposed, auto-assigned by join order.
const HOMES = [
  {
    name: "United States", lng: -77.0, lat: 38.9,
    cities: [
      ["Washington", -77.0, 38.9], ["New York", -74.0, 40.7], ["Chicago", -87.6, 41.8],
      ["Los Angeles", -118.2, 34.1], ["Houston", -95.4, 29.8],
    ],
  },
  {
    name: "Russia", lng: 37.6, lat: 55.75,
    cities: [
      ["Moscow", 37.6, 55.75], ["St Petersburg", 30.3, 59.9], ["Novosibirsk", 82.9, 55.0],
      ["Yekaterinburg", 60.6, 56.8], ["Kazan", 49.1, 55.8],
    ],
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function bad(msg: string, status = 400) { return json({ error: msg }, status); }

function haversine(aLng: number, aLat: number, bLng: number, bLat: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Deterministic PRNG (mulberry32) seeded per match so resolution is reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function code5() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

async function requirePlayer(playerId: string, secret: string) {
  const { data } = await db.from("gd_players").select("id,secret").eq("id", playerId).maybeSingle();
  if (!data || data.secret !== secret) throw new Error("bad player credentials");
  return data;
}
async function seedCities(matchId: string, playerId: string, slot: number) {
  const home = HOMES[slot % 2];
  const rows = home.cities.map(([name, lng, lat]) => ({
    match_id: matchId, player_id: playerId, name, lng, lat, hp: 100, alive: true,
  }));
  await db.from("gd_cities").insert(rows);
  return home;
}

async function resolve(match: any) {
  const matchId = match.id;
  const [{ data: players }, { data: cities }, { data: placements }] = await Promise.all([
    db.from("gd_match_players").select("*").eq("match_id", matchId),
    db.from("gd_cities").select("*").eq("match_id", matchId),
    db.from("gd_placements").select("*").eq("match_id", matchId),
  ]);
  const cityById: Record<string, any> = {};
  for (const c of cities!) { c.hp = 100; c.alive = true; cityById[c.id] = c; }

  const rand = rng(Number(match.seed) || 1);
  const silos = placements!.filter((p) => p.kind === "silo" && p.target_city_id)
    .sort((a, b) => (a.player_id + a.created_at).localeCompare(b.player_id + b.created_at));

  const replay: any[] = [];
  const slotOf: Record<string, number> = {};
  for (const mp of players!) slotOf[mp.player_id] = mp.slot;
  let t = 0;
  for (const silo of silos) {
    const target = cityById[silo.target_city_id];
    if (!target || !target.alive) continue;
    const defenderId = target.player_id;
    const defenses = placements!.filter((p) => p.player_id === defenderId && p.kind !== "silo");
    const radar = defenses.some((d) => d.kind === "radar" &&
      haversine(d.lng, d.lat, target.lng, target.lat) <= R.radar);
    let survival = 1;
    for (const d of defenses) {
      const dist = haversine(d.lng, d.lat, target.lng, target.lat);
      if (d.kind === "interceptor" && dist <= R.interceptor) {
        survival *= 1 - Math.min(P.capInterceptor, P.interceptor + (radar ? P.radarBoost : 0));
      } else if (d.kind === "dome" && dist <= R.dome) {
        survival *= 1 - P.dome;
      }
    }
    const interceptProb = 1 - survival;
    t += 1;
    replay.push({ t, type: "launch", attackerSlot: slotOf[silo.player_id],
      fromLng: silo.lng, fromLat: silo.lat, toLng: target.lng, toLat: target.lat, cityId: target.id });
    if (rand() < interceptProb) {
      replay.push({ t: t + 0.6, type: "intercept", toLng: target.lng, toLat: target.lat, cityId: target.id });
    } else {
      target.hp -= WARHEAD_DAMAGE;
      const destroyed = target.hp <= 0;
      if (destroyed) { target.hp = 0; target.alive = false; }
      replay.push({ t: t + 0.9, type: destroyed ? "destroy" : "hit",
        toLng: target.lng, toLat: target.lat, cityId: target.id, damage: WARHEAD_DAMAGE });
    }
  }

  // Score: damage dealt to the enemy plus a bonus per city destroyed.
  const score: Record<number, number> = { 0: 0, 1: 0 };
  const alive: Record<number, number> = { 0: 0, 1: 0 };
  for (const c of cities!) {
    const ownerSlot = slotOf[c.player_id];
    const enemySlot = ownerSlot === 0 ? 1 : 0;
    const dmg = 100 - c.hp;
    score[enemySlot] += dmg + (c.alive ? 0 : 200);
    if (c.alive) alive[ownerSlot] += 1;
  }
  let winnerSlot: number | null = null;
  if (score[0] !== score[1]) winnerSlot = score[0] > score[1] ? 0 : 1;
  else if (alive[0] !== alive[1]) winnerSlot = alive[0] > alive[1] ? 0 : 1;
  const winnerId = winnerSlot === null ? null :
    players!.find((p) => p.slot === winnerSlot)?.player_id ?? null;

  // Persist city damage, result, and closed match state.
  for (const c of cities!) await db.from("gd_cities").update({ hp: c.hp, alive: c.alive }).eq("id", c.id);
  const summary = { score, alive, winnerSlot };
  await db.from("gd_results").upsert({ match_id: matchId, winner_player_id: winnerId, summary, replay });
  await db.from("gd_matches").update({ status: "done", winner_player_id: winnerId }).eq("id", matchId);
  return { summary, replay, winnerId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const action = body.action as string;

  try {
    if (action === "create") {
      const handle = String(body.handle || "Commander").slice(0, 24);
      const { data: player } = await db.from("gd_players").insert({ handle }).select().single();
      let match: any = null;
      for (let i = 0; i < 6 && !match; i++) {
        const { data, error } = await db.from("gd_matches")
          .insert({ code: code5(), created_by: player!.id }).select().single();
        if (!error) match = data;
      }
      if (!match) return bad("could not create match", 500);
      await db.from("gd_match_players").insert({
        match_id: match.id, player_id: player!.id, slot: 0, handle,
        home_lng: HOMES[0].lng, home_lat: HOMES[0].lat,
      });
      await seedCities(match.id, player!.id, 0);
      return json({ player, match });
    }

    if (action === "join") {
      const handle = String(body.handle || "Commander").slice(0, 24);
      const { data: match } = await db.from("gd_matches").select("*")
        .eq("code", String(body.code || "").toUpperCase()).maybeSingle();
      if (!match) return bad("match not found", 404);
      if (match.status !== "lobby") return bad("match already started");
      const { count } = await db.from("gd_match_players").select("*", { count: "exact", head: true })
        .eq("match_id", match.id);
      if ((count ?? 0) >= 2) return bad("match is full");
      const { data: player } = await db.from("gd_players").insert({ handle }).select().single();
      await db.from("gd_match_players").insert({
        match_id: match.id, player_id: player!.id, slot: 1, handle,
        home_lng: HOMES[1].lng, home_lat: HOMES[1].lat,
      });
      await seedCities(match.id, player!.id, 1);
      return json({ player, match });
    }

    if (action === "start") {
      await requirePlayer(body.playerId, body.secret);
      const { data: match } = await db.from("gd_matches").select("*").eq("id", body.matchId).maybeSingle();
      if (!match) return bad("match not found", 404);
      if (match.status !== "lobby") return json({ match });
      const { count } = await db.from("gd_match_players").select("*", { count: "exact", head: true })
        .eq("match_id", match.id);
      if ((count ?? 0) < 2) return bad("need two players to start");
      const ends = new Date(Date.now() + match.build_seconds * 1000).toISOString();
      const { data: updated } = await db.from("gd_matches")
        .update({ status: "build", build_ends_at: ends }).eq("id", match.id).select().single();
      return json({ match: updated });
    }

    if (action === "place") {
      await requirePlayer(body.playerId, body.secret);
      const { data: match } = await db.from("gd_matches").select("*").eq("id", body.matchId).maybeSingle();
      if (!match || match.status !== "build") return bad("not in build phase");
      const kind = String(body.kind);
      if (!(kind in COST)) return bad("unknown kind");
      const { data: mp } = await db.from("gd_match_players").select("*")
        .eq("match_id", body.matchId).eq("player_id", body.playerId).single();
      const cost = COST[kind];
      if (mp!.spent + cost > mp!.budget) return bad("insufficient budget");
      if (kind === "silo" && !body.targetCityId) return bad("silo needs a target city");
      const { data: placement } = await db.from("gd_placements").insert({
        match_id: body.matchId, player_id: body.playerId, kind,
        lng: body.lng, lat: body.lat, target_city_id: body.targetCityId ?? null, cost,
      }).select().single();
      await db.from("gd_match_players").update({ spent: mp!.spent + cost })
        .eq("match_id", body.matchId).eq("player_id", body.playerId);
      return json({ placement, spent: mp!.spent + cost, budget: mp!.budget });
    }

    if (action === "unplace") {
      await requirePlayer(body.playerId, body.secret);
      const { data: p } = await db.from("gd_placements").select("*")
        .eq("id", body.placementId).eq("player_id", body.playerId).maybeSingle();
      if (!p) return bad("placement not found", 404);
      await db.from("gd_placements").delete().eq("id", p.id);
      const { data: mp } = await db.from("gd_match_players").select("*")
        .eq("match_id", p.match_id).eq("player_id", body.playerId).single();
      const spent = Math.max(0, mp!.spent - p.cost);
      await db.from("gd_match_players").update({ spent })
        .eq("match_id", p.match_id).eq("player_id", body.playerId);
      return json({ removed: p.id, spent });
    }

    if (action === "ready") {
      await requirePlayer(body.playerId, body.secret);
      await db.from("gd_match_players").update({ ready: true })
        .eq("match_id", body.matchId).eq("player_id", body.playerId);
      const { data: mps } = await db.from("gd_match_players").select("ready").eq("match_id", body.matchId);
      const allReady = (mps?.length ?? 0) >= 2 && mps!.every((m) => m.ready);
      if (allReady) {
        const { data: match } = await db.from("gd_matches").select("*").eq("id", body.matchId).single();
        if (match.status === "build") return json({ result: await resolve(match), allReady });
      }
      return json({ allReady });
    }

    if (action === "resolve") {
      await requirePlayer(body.playerId, body.secret);
      const { data: match } = await db.from("gd_matches").select("*").eq("id", body.matchId).maybeSingle();
      if (!match) return bad("match not found", 404);
      if (match.status === "done") {
        const { data: existing } = await db.from("gd_results").select("*").eq("match_id", match.id).maybeSingle();
        return json({ result: existing, alreadyDone: true });
      }
      if (match.status !== "build") return bad("not in build phase");
      const deadline = match.build_ends_at ? new Date(match.build_ends_at).getTime() : 0;
      const { data: mps } = await db.from("gd_match_players").select("ready").eq("match_id", match.id);
      const allReady = (mps?.length ?? 0) >= 2 && mps!.every((m) => m.ready);
      if (!allReady && Date.now() < deadline) return bad("build phase still running");
      return json({ result: await resolve(match) });
    }

    if (action === "state") {
      const { data: match } = await db.from("gd_matches").select("*").eq("id", body.matchId).maybeSingle();
      if (!match) return bad("match not found", 404);
      const [{ data: players }, { data: cities }, { data: result }] = await Promise.all([
        db.from("gd_match_players").select("*").eq("match_id", match.id).order("slot"),
        db.from("gd_cities").select("*").eq("match_id", match.id),
        db.from("gd_results").select("*").eq("match_id", match.id).maybeSingle(),
      ]);
      let placements: any[] = [];
      if (body.playerId && body.secret) {
        try {
          await requirePlayer(body.playerId, body.secret);
          const { data } = await db.from("gd_placements").select("*")
            .eq("match_id", match.id).eq("player_id", body.playerId);
          placements = data ?? [];
        } catch { /* unauthenticated state read: no own placements */ }
      }
      return json({ match, players, cities, placements, result });
    }

    return bad("unknown action");
  } catch (e) {
    return bad(String(e?.message ?? e), 400);
  }
});
