// DomeBreak match service. Server-authoritative free-for-all for 2-16 slots,
// each held by a human or an AI. Every mutation runs here with the service-role
// key after validating the caller. AI participants are played entirely by the
// server; combat is a deterministic, seeded simulation.
import {createClient} from "npm:@supabase/supabase-js@2";

const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {auth: {persistSession: false}},
);

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COST: Record<string, number> = {silo: 300, interceptor: 200, radar: 150};
const WARHEAD_DAMAGE = 60;
const R = {interceptor: 700, radar: 1400};
const P = {interceptor: 0.45, radarBoost: 0.12, capInterceptor: 0.7};
const MAX_SLOTS = 16;

// 16 nations spread across the globe. cities[0] is the capital / launch site.
const HOMES = [
    {
        name: "United States",
        cities: [["Washington", -77.04, 38.9], ["New York", -74.0, 40.71], ["Los Angeles", -118.24, 34.05]]
    },
    {
        name: "Russia",
        cities: [["Moscow", 37.62, 55.75], ["St Petersburg", 30.31, 59.94], ["Novosibirsk", 82.92, 55.03]]
    },
    {name: "China", cities: [["Beijing", 116.4, 39.9], ["Shanghai", 121.47, 31.23], ["Guangzhou", 113.26, 23.13]]},
    {name: "India", cities: [["New Delhi", 77.21, 28.61], ["Mumbai", 72.88, 19.08], ["Kolkata", 88.36, 22.57]]},
    {name: "Brazil", cities: [["Brasilia", -47.93, -15.78], ["Sao Paulo", -46.63, -23.55], ["Rio", -43.2, -22.91]]},
    {
        name: "United Kingdom",
        cities: [["London", -0.13, 51.51], ["Manchester", -2.24, 53.48], ["Birmingham", -1.9, 52.48]]
    },
    {name: "France", cities: [["Paris", 2.35, 48.86], ["Marseille", 5.37, 43.3], ["Lyon", 4.83, 45.76]]},
    {name: "Germany", cities: [["Berlin", 13.4, 52.52], ["Munich", 11.58, 48.14], ["Hamburg", 10.0, 53.55]]},
    {name: "Japan", cities: [["Tokyo", 139.69, 35.68], ["Osaka", 135.5, 34.69], ["Nagoya", 136.9, 35.18]]},
    {name: "Canada", cities: [["Ottawa", -75.7, 45.42], ["Toronto", -79.38, 43.65], ["Vancouver", -123.12, 49.28]]},
    {
        name: "Australia",
        cities: [["Canberra", 149.13, -35.28], ["Sydney", 151.21, -33.87], ["Melbourne", 144.96, -37.81]]
    },
    {name: "Egypt", cities: [["Cairo", 31.24, 30.04], ["Alexandria", 29.92, 31.2], ["Luxor", 32.64, 25.69]]},
    {
        name: "South Africa",
        cities: [["Pretoria", 28.19, -25.75], ["Johannesburg", 28.05, -26.2], ["Cape Town", 18.42, -33.92]]
    },
    {name: "Iran", cities: [["Tehran", 51.39, 35.69], ["Mashhad", 59.61, 36.3], ["Isfahan", 51.68, 32.65]]},
    {
        name: "Mexico",
        cities: [["Mexico City", -99.13, 19.43], ["Guadalajara", -103.35, 20.66], ["Monterrey", -100.32, 25.69]]
    },
    {name: "Turkey", cities: [["Ankara", 32.85, 39.93], ["Istanbul", 28.98, 41.01], ["Izmir", 27.14, 38.42]]},
];

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {status, headers: {...cors, "Content-Type": "application/json"}});
}

function bad(msg: string, status = 400) {
    return json({error: msg}, status);
}

function haversine(aLng: number, aLat: number, bLng: number, bLat: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function code5() {
    const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
}

async function requirePlayer(playerId: string, secret: string) {
    const {data} = await db.from("db_players").select("id,secret").eq("id", playerId).maybeSingle();
    if (!data || data.secret !== secret) throw new Error("bad player credentials");
    return data;
}

async function requireHost(matchId: string, playerId: string, secret: string) {
    await requirePlayer(playerId, secret);
    const {data: match} = await db.from("db_matches").select("*").eq("id", matchId).maybeSingle();
    if (!match) throw new Error("match not found");
    if (match.created_by !== playerId) throw new Error("only the host can do that");
    return match;
}

async function seedCities(matchId: string, playerId: string, slot: number) {
    const home = HOMES[slot % HOMES.length];
    const rows = home.cities.map(([name, lng, lat]) => ({
        match_id: matchId, player_id: playerId, name, lng, lat, hp: 100, alive: true,
    }));
    await db.from("db_cities").insert(rows);
    return home;
}

async function usedSlots(matchId: string) {
    const {data} = await db.from("db_match_players").select("slot").eq("match_id", matchId);
    return new Set((data ?? []).map((r) => r.slot));
}

async function nextEmptySlot(matchId: string, maxSlots: number, preferred?: number) {
    const used = await usedSlots(matchId);
    if (preferred != null && preferred >= 0 && preferred < maxSlots && !used.has(preferred)) return preferred;
    for (let i = 0; i < maxSlots; i++) if (!used.has(i)) return i;
    return -1;
}

// Deterministic AI: spend the remaining budget on interceptors over its cities,
// then silos at random enemy cities.
async function playAi(participant: any, cities: any[], seedBase: number) {
    let remaining = participant.budget - participant.spent;
    const mine = cities.filter((c) => c.player_id === participant.player_id);
    const enemies = cities.filter((c) => c.player_id !== participant.player_id);
    if (!mine.length) return;
    const rand = rng(seedBase + participant.slot * 7919);
    const capital = mine[0];
    const rows: any[] = [];
    const buy = (kind: string, lng: number, lat: number, target?: string) => {
        if (remaining < COST[kind]) return false;
        rows.push({
            match_id: participant.match_id, player_id: participant.player_id, kind, lng, lat,
            target_city_id: target ?? null, cost: COST[kind]
        });
        remaining -= COST[kind];
        return true;
    };
    for (const c of mine) buy("interceptor", c.lng, c.lat);
    let guard = 0;
    while (remaining >= COST.silo && enemies.length && guard++ < 40) {
        const t = enemies[Math.floor(rand() * enemies.length)];
        buy("silo", capital.lng, capital.lat, t.id);
    }
    if (rows.length) {
        await db.from("db_placements").insert(rows);
        await db.from("db_match_players").update({spent: participant.budget - remaining, ready: true})
            .eq("match_id", participant.match_id).eq("player_id", participant.player_id);
    }
}

async function resolve(matchId: string) {
    // Compare-and-swap lock: only the caller that flips build->combat resolves.
    const {data: locked} = await db.from("db_matches").update({status: "combat"})
        .eq("id", matchId).eq("status", "build").select().maybeSingle();
    if (!locked) {
        const {data: existing} = await db.from("db_results").select("*").eq("match_id", matchId).maybeSingle();
        return existing
            ? {summary: existing.summary, replay: existing.replay, winnerId: existing.winner_player_id, already: true}
            : {pending: true};
    }
    const match = locked;

    const {data: players} = await db.from("db_match_players").select("*").eq("match_id", matchId).order("slot");
    const {data: cities0} = await db.from("db_cities").select("*").eq("match_id", matchId);
    // AI participants spend their remaining budget before the exchange.
    for (const mp of players!.filter((p) => p.is_ai)) await playAi(mp, cities0!, Number(match.seed) || 1);

    const {data: cities} = await db.from("db_cities").select("*").eq("match_id", matchId);
    const {data: placements} = await db.from("db_placements").select("*").eq("match_id", matchId);
    const cityById: Record<string, any> = {};
    for (const c of cities!) {
        c.hp = 100;
        c.alive = true;
        cityById[c.id] = c;
    }
    const slotOf: Record<string, number> = {};
    for (const mp of players!) slotOf[mp.player_id] = mp.slot;

    const rand = rng(Number(match.seed) || 1);
    const silos = placements!.filter((p) => p.kind === "silo" && p.target_city_id)
        .sort((a, b) => (String(a.player_id) + a.created_at + a.id).localeCompare(String(b.player_id) + b.created_at + b.id));

    const replay: any[] = [];
    let t = 0;
    for (const silo of silos) {
        const target = cityById[silo.target_city_id];
        if (!target || !target.alive || target.player_id === silo.player_id) continue;
        const defenses = placements!.filter((p) => p.player_id === target.player_id && p.kind !== "silo");
        const radar = defenses.some((d) => d.kind === "radar" && haversine(d.lng, d.lat, target.lng, target.lat) <= R.radar);
        let survival = 1;
        for (const d of defenses) {
            const dist = haversine(d.lng, d.lat, target.lng, target.lat);
            if (d.kind === "interceptor" && dist <= R.interceptor) {
                survival *= 1 - Math.min(P.capInterceptor, P.interceptor + (radar ? P.radarBoost : 0));
            }
        }
        t += 1;
        replay.push({
            t, type: "launch", attackerSlot: slotOf[silo.player_id],
            fromLng: silo.lng, fromLat: silo.lat, toLng: target.lng, toLat: target.lat, cityId: target.id
        });
        if (rand() < 1 - survival) {
            replay.push({t: t + 0.6, type: "intercept", toLng: target.lng, toLat: target.lat, cityId: target.id});
        } else {
            target.hp -= WARHEAD_DAMAGE;
            const destroyed = target.hp <= 0;
            if (destroyed) {
                target.hp = 0;
                target.alive = false;
            }
            replay.push({
                t: t + 0.9,
                type: destroyed ? "destroy" : "hit",
                toLng: target.lng,
                toLat: target.lat,
                cityId: target.id,
                damage: WARHEAD_DAMAGE,
                attackerSlot: slotOf[silo.player_id]
            });
        }
    }

    // Free-for-all score: credit each attacker for damage dealt to others.
    const score: Record<number, number> = {};
    const alive: Record<number, number> = {};
    for (const mp of players!) {
        score[mp.slot] = 0;
        alive[mp.slot] = 0;
    }
    for (const ev of replay) {
        if ((ev.type === "hit" || ev.type === "destroy") && ev.attackerSlot != null) {
            score[ev.attackerSlot] += ev.damage + (ev.type === "destroy" ? 200 : 0);
        }
    }
    for (const c of cities!) if (c.alive) alive[slotOf[c.player_id]] += 1;

    let winnerSlot: number | null = null;
    let best = -1, tie = false;
    for (const mp of players!) {
        const s = score[mp.slot];
        if (s > best) {
            best = s;
            winnerSlot = mp.slot;
            tie = false;
        } else if (s === best) tie = true;
    }
    if (tie) {
        let bestAlive = -1;
        winnerSlot = null;
        let atie = false;
        for (const mp of players!) {
            if (score[mp.slot] !== best) continue;
            if (alive[mp.slot] > bestAlive) {
                bestAlive = alive[mp.slot];
                winnerSlot = mp.slot;
                atie = false;
            } else if (alive[mp.slot] === bestAlive) atie = true;
        }
        if (atie) winnerSlot = null;
    }
    if (best <= 0) winnerSlot = null;
    const winnerId = winnerSlot === null ? null : players!.find((p) => p.slot === winnerSlot)?.player_id ?? null;

    for (const c of cities!) await db.from("db_cities").update({hp: c.hp, alive: c.alive}).eq("id", c.id);
    const summary = {score, alive, winnerSlot};
    await db.from("db_results").upsert({match_id: matchId, winner_player_id: winnerId, summary, replay});
    await db.from("db_matches").update({status: "done", winner_player_id: winnerId}).eq("id", matchId);
    return {summary, replay, winnerId};
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: cors});
    if (req.method !== "POST") return bad("POST only", 405);
    let body: any;
    try {
        body = await req.json();
    } catch {
        return bad("invalid json");
    }
    const a = body.action as string;

    try {
        if (a === "create") {
            const handle = String(body.handle || "Commander").slice(0, 24);
            const maxSlots = Math.max(2, Math.min(MAX_SLOTS, parseInt(body.maxSlots, 10) || 2));
            const {data: player} = await db.from("db_players").insert({handle}).select().single();
            let match: any = null;
            for (let i = 0; i < 6 && !match; i++) {
                const {data, error} = await db.from("db_matches")
                    .insert({code: code5(), created_by: player!.id, max_slots: maxSlots}).select().single();
                if (!error) match = data;
            }
            if (!match) return bad("could not create match", 500);
            await db.from("db_match_players").insert({
                match_id: match.id, player_id: player!.id, slot: 0, handle,
                home_lng: HOMES[0].cities[0][1], home_lat: HOMES[0].cities[0][2],
            });
            await seedCities(match.id, player!.id, 0);
            return json({player, match});
        }

        if (a === "join") {
            const handle = String(body.handle || "Commander").slice(0, 24);
            const {data: match} = await db.from("db_matches").select("*")
                .eq("code", String(body.code || "").toUpperCase()).maybeSingle();
            if (!match) return bad("match not found", 404);
            if (match.status !== "lobby") return bad("match already started");
            const slot = await nextEmptySlot(match.id, match.max_slots);
            if (slot < 0) return bad("match is full");
            const {data: player} = await db.from("db_players").insert({handle}).select().single();
            const home = HOMES[slot % HOMES.length];
            await db.from("db_match_players").insert({
                match_id: match.id, player_id: player!.id, slot, handle,
                home_lng: home.cities[0][1], home_lat: home.cities[0][2],
            });
            await seedCities(match.id, player!.id, slot);
            return json({player, match});
        }

        if (a === "setMaxSlots") {
            const match = await requireHost(body.matchId, body.playerId, body.secret);
            if (match.status !== "lobby") return bad("only in lobby");
            const used = await usedSlots(match.id);
            const highest = used.size ? Math.max(...used) : 0;
            const next = Math.max(2, Math.min(MAX_SLOTS, parseInt(body.maxSlots, 10) || 2, MAX_SLOTS));
            if (next <= highest) return bad("a filled slot is above that count");
            const {data} = await db.from("db_matches").update({max_slots: next}).eq("id", match.id).select().single();
            return json({match: data});
        }

        if (a === "addAi") {
            const match = await requireHost(body.matchId, body.playerId, body.secret);
            if (match.status !== "lobby") return bad("only in lobby");
            const slot = await nextEmptySlot(match.id, match.max_slots, body.slot);
            if (slot < 0) return bad("no empty slot");
            const home = HOMES[slot % HOMES.length];
            const {data: aiPlayer} = await db.from("db_players").insert({handle: `AI · ${home.name}`}).select().single();
            await db.from("db_match_players").insert({
                match_id: match.id, player_id: aiPlayer!.id, slot, handle: `AI · ${home.name}`,
                is_ai: true, ready: true, home_lng: home.cities[0][1], home_lat: home.cities[0][2],
            });
            await seedCities(match.id, aiPlayer!.id, slot);
            return json({ok: true, slot});
        }

        if (a === "removeParticipant") {
            const match = await requireHost(body.matchId, body.playerId, body.secret);
            if (match.status !== "lobby") return bad("only in lobby");
            const {data: mp} = await db.from("db_match_players").select("*")
                .eq("match_id", match.id).eq("slot", body.slot).maybeSingle();
            if (!mp) return bad("empty slot");
            if (mp.player_id === match.created_by) return bad("cannot remove the host");
            await db.from("db_match_players").delete().eq("match_id", match.id).eq("player_id", mp.player_id);
            await db.from("db_cities").delete().eq("match_id", match.id).eq("player_id", mp.player_id);
            await db.from("db_placements").delete().eq("match_id", match.id).eq("player_id", mp.player_id);
            return json({ok: true});
        }

        // Replace a (human) participant with an AI. Unlimited: any slot, any time
        // while the match is live. The AI inherits the seat and finishes its budget.
        if (a === "replaceWithAi") {
            const match = await requireHost(body.matchId, body.playerId, body.secret);
            if (match.status === "done") return bad("match is over");
            const {data: mp} = await db.from("db_match_players").select("*")
                .eq("match_id", match.id).eq("slot", body.slot).maybeSingle();
            if (!mp) return bad("empty slot");
            if (mp.player_id === match.created_by) return bad("cannot replace the host");
            const home = HOMES[mp.slot % HOMES.length];
            await db.from("db_match_players").update({is_ai: true, ready: true, handle: `AI · ${home.name}`})
                .eq("match_id", match.id).eq("player_id", mp.player_id);
            return json({ok: true});
        }

        if (a === "start") {
            const match = await requireHost(body.matchId, body.playerId, body.secret);
            if (match.status !== "lobby") return json({match});
            const {count} = await db.from("db_match_players").select("*", {
                count: "exact",
                head: true
            }).eq("match_id", match.id);
            if ((count ?? 0) < 2) return bad("need at least two participants");
            const ends = new Date(Date.now() + match.build_seconds * 1000).toISOString();
            const {data: updated} = await db.from("db_matches")
                .update({status: "build", build_ends_at: ends}).eq("id", match.id).select().single();
            return json({match: updated});
        }

        if (a === "place") {
            await requirePlayer(body.playerId, body.secret);
            const {data: match} = await db.from("db_matches").select("*").eq("id", body.matchId).maybeSingle();
            if (!match || match.status !== "build") return bad("not in build phase");
            const kind = String(body.kind);
            if (!(kind in COST)) return bad("unknown kind");
            const {data: mp} = await db.from("db_match_players").select("*")
                .eq("match_id", body.matchId).eq("player_id", body.playerId).maybeSingle();
            if (!mp) return bad("not in this match");
            const cost = COST[kind];
            if (mp.spent + cost > mp.budget) return bad("insufficient budget");
            if (kind === "silo" && !body.targetCityId) return bad("silo needs a target city");
            const {data: placement} = await db.from("db_placements").insert({
                match_id: body.matchId, player_id: body.playerId, kind,
                lng: body.lng, lat: body.lat, target_city_id: body.targetCityId ?? null, cost,
            }).select().single();
            await db.from("db_match_players").update({spent: mp.spent + cost})
                .eq("match_id", body.matchId).eq("player_id", body.playerId);
            return json({placement, spent: mp.spent + cost, budget: mp.budget});
        }

        if (a === "unplace") {
            await requirePlayer(body.playerId, body.secret);
            const {data: p} = await db.from("db_placements").select("*")
                .eq("id", body.placementId).eq("player_id", body.playerId).maybeSingle();
            if (!p) return bad("placement not found", 404);
            await db.from("db_placements").delete().eq("id", p.id);
            const {data: mp} = await db.from("db_match_players").select("*")
                .eq("match_id", p.match_id).eq("player_id", body.playerId).single();
            const spent = Math.max(0, mp!.spent - p.cost);
            await db.from("db_match_players").update({spent}).eq("match_id", p.match_id).eq("player_id", body.playerId);
            return json({removed: p.id, spent});
        }

        if (a === "ready") {
            await requirePlayer(body.playerId, body.secret);
            await db.from("db_match_players").update({ready: true})
                .eq("match_id", body.matchId).eq("player_id", body.playerId);
            const {data: mps} = await db.from("db_match_players").select("ready,is_ai").eq("match_id", body.matchId);
            const humans = (mps ?? []).filter((m) => !m.is_ai);
            const allReady = (mps?.length ?? 0) >= 2 && humans.every((m) => m.ready);
            if (allReady) return json({result: await resolve(body.matchId), allReady});
            return json({allReady});
        }

        if (a === "resolve") {
            await requirePlayer(body.playerId, body.secret);
            const {data: match} = await db.from("db_matches").select("*").eq("id", body.matchId).maybeSingle();
            if (!match) return bad("match not found", 404);
            if (match.status === "done") {
                const {data: existing} = await db.from("db_results").select("*").eq("match_id", match.id).maybeSingle();
                return json({result: existing, alreadyDone: true});
            }
            if (match.status === "combat") return json({result: await resolve(body.matchId)});
            if (match.status !== "build") return bad("not in build phase");
            const deadline = match.build_ends_at ? new Date(match.build_ends_at).getTime() : 0;
            const {data: mps} = await db.from("db_match_players").select("ready,is_ai").eq("match_id", match.id);
            const humans = (mps ?? []).filter((m) => !m.is_ai);
            const allReady = (mps?.length ?? 0) >= 2 && humans.every((m) => m.ready);
            if (!allReady && Date.now() < deadline) return bad("build phase still running");
            return json({result: await resolve(body.matchId)});
        }

        if (a === "state") {
            const {data: match} = await db.from("db_matches").select("*").eq("id", body.matchId).maybeSingle();
            if (!match) return bad("match not found", 404);
            const [{data: players}, {data: cities}, {data: result}] = await Promise.all([
                db.from("db_match_players").select("*").eq("match_id", match.id).order("slot"),
                db.from("db_cities").select("*").eq("match_id", match.id),
                db.from("db_results").select("*").eq("match_id", match.id).maybeSingle(),
            ]);
            let placements: any[] = [];
            if (body.playerId && body.secret) {
                try {
                    await requirePlayer(body.playerId, body.secret);
                    const {data} = await db.from("db_placements").select("*")
                        .eq("match_id", match.id).eq("player_id", body.playerId);
                    placements = data ?? [];
                } catch { /* unauthenticated state read */
                }
            }
            return json({match, players, cities, placements, result});
        }

        return bad("unknown action");
    } catch (e) {
        return bad(String((e as Error)?.message ?? e), 400);
    }
});
