import {useEffect, useMemo, useReducer, useRef} from "react";
import {
    cancelProd,
    commandAttack,
    declareWar,
    disembark,
    embark,
    enqueueResearch,
    makePeace,
    moveUnit,
    queueAircraft,
    queueAmmo,
    queueUnit,
    scrapUnit,
    setAwacsPatrol,
    setMarch,
    setPatrolSize,
    setSail,
    setWarhead,
    shelterLeadership,
    step,
    stopSail,
    unqueueResearch
} from "../../game/engine.js";

// Drives a supplied world (created by App from a new setup or a loaded save).
// Mutated in place; re-renders on a throttled tick.
export function useEngine(world) {
    const ref = useRef(world);
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        let raf, last = performance.now(), acc = 0;
        const loop = (now) => {
            const w = ref.current;
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            if (w && !w.paused && !w.over) step(w, dt * w.speed);
            acc += dt;
            if (acc >= 0.033) { // ~30fps — keeps aircraft/ship motion fluid
                acc = 0;
                force();
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    const api = useMemo(() => ({
        setSpeed: (m) => {
            ref.current.speed = m;
            ref.current.paused = false;
            force();
        },
        pause: () => {
            ref.current.paused = true;
            force();
        },
        play: () => {
            ref.current.paused = false;
            force();
        },
        buyPlace: (type, lng, lat, territoryOk) => {
            const r = queueUnit(ref.current, ref.current.mySlot, type, lng, lat, territoryOk);
            force();
            return r;
        },
        commandAttack: (uid, tid) => {
            const r = commandAttack(ref.current, uid, tid);
            force();
            return r;
        },
        research: (id) => {
            const r = enqueueResearch(ref.current, ref.current.mySlot, id);
            force();
            return r;
        },
        unqueue: (id) => {
            const r = unqueueResearch(ref.current, ref.current.mySlot, id);
            force();
            return r;
        },
        move: (uid, lng, lat, territoryOk) => {
            const r = moveUnit(ref.current, ref.current.mySlot, uid, lng, lat, territoryOk);
            force();
            return r;
        },
        setSail: (uid, lng, lat) => {
            const r = setSail(ref.current, ref.current.mySlot, uid, lng, lat);
            force();
            return r;
        },
        march: (uid, lng, lat) => {
            const r = setMarch(ref.current, ref.current.mySlot, uid, lng, lat);
            force();
            return r;
        },
        stopSail: (uid) => {
            const r = stopSail(ref.current, ref.current.mySlot, uid);
            force();
            return r;
        },
        queueAircraft: (baseId, type) => {
            const r = queueAircraft(ref.current, ref.current.mySlot, baseId, type);
            force();
            return r;
        },
        setPatrolSize: (uid, size) => {
            const r = setPatrolSize(ref.current, ref.current.mySlot, uid, size);
            force();
            return r;
        },
        setAwacsPatrol: (uid, on) => {
            const r = setAwacsPatrol(ref.current, ref.current.mySlot, uid, on);
            force();
            return r;
        },
        declareWar: (slot) => {
            declareWar(ref.current, ref.current.mySlot, slot);
            force();
        },
        makePeace: (slot) => {
            makePeace(ref.current, ref.current.mySlot, slot);
            force();
        },
        scrap: (uid) => {
            const r = scrapUnit(ref.current, ref.current.mySlot, uid);
            force();
            return r;
        },
        produceAmmo: (type) => {
            const r = queueAmmo(ref.current, ref.current.mySlot, type);
            force();
            return r;
        },
        cancelProd: (i) => {
            const r = cancelProd(ref.current, ref.current.mySlot, i);
            force();
            return r;
        },
        setWarhead: (uid, type) => {
            const r = setWarhead(ref.current, ref.current.mySlot, uid, type);
            force();
            return r;
        },
        embark: (transportId, groundUnitId) => {
            const r = embark(ref.current, ref.current.mySlot, transportId, groundUnitId);
            force();
            return r;
        },
        disembark: (transportId, lng, lat) => {
            const r = disembark(ref.current, ref.current.mySlot, transportId, lng, lat);
            force();
            return r;
        },
        shelterLeadership: () => {
            const r = shelterLeadership(ref.current, ref.current.mySlot);
            force();
            return r;
        },
    }), []);
    return [ref.current, api, force];
}
