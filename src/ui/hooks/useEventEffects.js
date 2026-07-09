// Battle audio + toast/explosion pipeline: turns fresh world.events into synthesized
// sfx, screen toasts, and explosion markers.
//
// The world is mutated in place; the effect keys off w.time (the tick counter) to
// drain fresh events each tick — a trigger exhaustive-deps can't model, so it's off here.
/* eslint-disable react-hooks/exhaustive-deps */
import {useEffect, useRef} from "react";
import {FALLOUT, haversine} from "../../game/engine.js";
import {AUDIO_SPATIAL} from "../../game/data/constants.js";
import {sfx} from "../../game/platform/audio.js";
import {clampSym} from "../../lib/math.js";
import {byId} from "../../lib/iter.js";

export function useEventEffects({w, mySlot, mapRef, setErr, setExplosions, onGameEnd}) {
    // Seed with whatever the world already carries (loaded saves keep their last
    // 60 events) so mount doesn't replay a backlog of explosions and sounds.
    const seen = useRef(null);
    if (!seen.current) {
        seen.current = new Set(w.events.map((e) => e.id));
        if (w.over) seen.current.add("over");
    }

    // Spatial cue: the viewport is the listener. Project the event to the screen,
    // pan it by horizontal position, and fade its volume radially from dead-centre
    // out to the corners. Anything projecting past the view (plus a small margin)
    // is inaudible — combat you can't see doesn't reach you. Return values carry a
    // three-way meaning for the caller:
    //   undefined → not a map event (no coords / map not ready): play centred+full
    //   null      → has coords but off-screen: caller must stay silent
    //   {pan,gain}→ on-screen: positioned and distance-faded
    const spatialize = (e) => {
        const m = mapRef.current;
        if (!m || e.lng == null || e.lat == null) return undefined;
        const c = m.getContainer();
        const w = c.clientWidth || 1, h = c.clientHeight || 1;
        const p = m.project([e.lng, e.lat]);
        const fx = p.x / w, fy = p.y / h;             // 0..1 across / down the viewport
        const mgn = AUDIO_SPATIAL.edgeMargin;
        if (fx < -mgn || fx > 1 + mgn || fy < -mgn || fy > 1 + mgn) return null; // off-screen → silent
        const pan = clampSym((fx - 0.5) * 2, 1);
        // Radial distance from viewport centre: 0 at centre, 1 at a corner.
        const r = Math.min(1, Math.hypot((fx - 0.5) * 2, (fy - 0.5) * 2) / Math.SQRT2);
        const gain = Math.max(AUDIO_SPATIAL.minGain, 1 - (1 - AUDIO_SPATIAL.edgeGain) * r);
        return {pan, gain};
    };

    // Battle audio: every fresh engine event gets a synthesized cue. World impacts
    // (booms, misses) are positional — they only reach you if they land on-screen,
    // faded by distance from the camera; a war on the far side of the globe is
    // silent. Launches and MIRV splits only sound if my sensors actually saw them
    // (fog of war has ears too) AND they're on-screen. Everything below the WORLD
    // block is player-specific (my alerts, my diplomacy, my economy) and always
    // plays full — never another player's private events. Successful interceptor
    // kills (the "intercept" event) are intentionally silent — the visual flash
    // still plays, but by request they carry no sound.
    const eventSound = (e) => {
        const WORLD = {
            miss: "miss",
            fizzle: "fizzle",
            hit: "boom",
            destroy: "destroy"
        };
        if (WORLD[e.type]) {
            const s = spatialize(e);
            if (s === null) return;               // has coords but off-screen → stay silent
            return sfx(WORLD[e.type], s);         // {pan,gain} on-screen, or undefined (full) if map not ready
        }
        if (e.type === "launch" || e.type === "mirv") {
            if (e.seen && !e.seen.includes(mySlot)) return; // my sensors never saw it
            const s = spatialize(e);
            if (s === null) return;               // seen, but off-screen → silent
            return sfx(e.type === "mirv" ? "mirv" : "launch", s);
        }
        if (e.type === "detected" && e.slot === mySlot) return sfx("detected");
        if (e.type === "war" && (e.a === mySlot || e.b === mySlot)) return sfx("war");
        if (e.type === "callToArms" && (e.a === mySlot || e.b === mySlot)) return sfx("war");
        if (e.type === "peace" && (e.a === mySlot || e.b === mySlot)) return sfx("peace");
        if ((e.type === "alliance" || e.type === "breakalliance") && (e.a === mySlot || e.b === mySlot)) return sfx("peace");
        if (e.type === "conquest" && (e.winner === mySlot || e.loser === mySlot)) return sfx(e.winner === mySlot ? "win" : "lose");
        if (e.type === "built" && e.slot === mySlot) return sfx("built");
    };

    useEffect(() => {
        const fresh = [];
        const cityDeaths = [];
        for (const e of w.events) {
            if (seen.current.has(e.id)) continue;
            seen.current.add(e.id);
            eventSound(e);
            if (e.type === "destroy" && e.kind === "city") {
                const c = byId(w.cities, e.cityId);
                if (c) cityDeaths.push({name: c.name, mine: c.slot === mySlot, fallout: !!e.fallout});
            }
            // Attack warning: a launch at me my sensors caught, or a track my
            // radars picked up mid-flight — either way, the klaxon toast.
            if ((e.type === "launch" && e.tgtSlot === mySlot && e.seen?.includes(mySlot)) ||
                (e.type === "detected" && e.slot === mySlot)) {
                setErr({msg: "Launch detected — missile inbound.", kind: "err"});
                setTimeout(() => setErr(null), 2600);
            }
            // Fallout on home soil: a fresh cloud that covers one of my cities
            // raises a one-time contamination warning (my own strikes near the
            // front count too — the radiation doesn't check allegiance).
            if (e.type === "fallout" && w.cities.some((c) => c.alive && c.slot === mySlot && haversine(e.lng, e.lat, c.lng, c.lat) <= FALLOUT.radiusKm)) {
                setErr({msg: "Radioactive fallout over your territory.", kind: "warn"});
                setTimeout(() => setErr(null), 3000);
            }
            if (e.type === "intercept") fresh.push({
                id: e.id,
                lng: e.lng,
                lat: e.lat,
                kind: "intercept",
                alt: e.alt || 0
            });
            else if (e.type === "miss") fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: "miss", alt: e.alt || 0});
            else if (e.type === "mirv" && (!e.seen || e.seen.includes(mySlot))) fresh.push({
                id: e.id,
                lng: e.lng,
                lat: e.lat,
                kind: "mirv",
                alt: e.alt || 0
            });
            else if (e.type === "hit" || e.type === "destroy") fresh.push({
                id: e.id,
                lng: e.lng,
                lat: e.lat,
                kind: e.type,
                alt: 0
            });
        }
        // City-death toast, aggregated across this tick so a MIRV that levels
        // several cities raises one notice, not a stack. My losses (red) take
        // priority over enemy losses (positive) for the single toast slot.
        if (cityDeaths.length) {
            const fmtList = (names) => names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
            const mine = cityDeaths.filter((d) => d.mine);
            const mineLost = mine.map((d) => d.name);
            const enemyLost = cityDeaths.filter((d) => !d.mine).map((d) => d.name);
            if (mineLost.length) setErr({msg: `Lost ${fmtList(mineLost)}${mine.every((d) => d.fallout) ? " to fallout" : ""}`, kind: "err"});
            else if (enemyLost.length) setErr({msg: `${fmtList(enemyLost)} destroyed`, kind: "info"});
            setTimeout(() => setErr(null), 3200);
        }
        if (seen.current.size > 500) seen.current = new Set(w.events.map((e) => e.id));
        if (w.over && !seen.current.has("over")) {
            seen.current.add("over");
            sfx(w.winnerSlot === mySlot ? "win" : "lose");
            onGameEnd?.({result: w.winnerSlot === mySlot ? "win" : "loss"});
        }
        if (!fresh.length) return;
        setExplosions((list) => [...list, ...fresh]);
        for (const e of fresh) {
            const id = e.id;
            setTimeout(() => setExplosions((list) => list.filter((x) => x.id !== id)), 850);
        }
    }, [w.time]);
}
