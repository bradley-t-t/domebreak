// Whitelisted client commands. Every entry receives (world, senderSlot, args)
// and forwards to the engine with the SENDER'S slot — a client can never act
// for another nation. commandAttack has no slot parameter in the engine, so
// ownership is enforced here.
import {
    breakAlliance,
    cancelProd,
    commandAttack,
    declareWar,
    disembark,
    embark,
    moveUnit,
    offerPeace,
    proposeAlliance,
    queueAircraft,
    queueAmmo,
    queueUnit,
    releaseLeadership,
    respondAlliance,
    respondPeace,
    scrapUnit,
    setAwacsPatrol,
    setMarch,
    setPatrolSize,
    setSail,
    setWarhead,
    shelterLeadership,
    stopSail,
} from "../../src/game/engine.js";

const num = (v) => (Number.isFinite(v) ? v : null);
const str = (v, max = 40) => (typeof v === "string" ? v.slice(0, max) : null);

export const COMMANDS = {
    buyPlace: (w, slot, [type, lng, lat, territoryOk]) =>
        queueUnit(w, slot, str(type), num(lng), num(lat), !!territoryOk),
    commandAttack: (w, slot, [uid, tid]) => {
        const u = w.units.find((x) => x.id === uid);
        if (!u || u.slot !== slot) return {error: "not your unit"};
        return commandAttack(w, uid, tid == null ? null : str(tid, 64));
    },
    move: (w, slot, [uid, lng, lat, territoryOk]) => moveUnit(w, slot, str(uid, 64), num(lng), num(lat), !!territoryOk),
    setSail: (w, slot, [uid, lng, lat]) => setSail(w, slot, str(uid, 64), num(lng), num(lat)),
    stopSail: (w, slot, [uid]) => stopSail(w, slot, str(uid, 64)),
    queueAircraft: (w, slot, [baseId, type]) => queueAircraft(w, slot, str(baseId, 64), str(type)),
    setPatrolSize: (w, slot, [uid, size]) => setPatrolSize(w, slot, str(uid, 64), num(size)),
    setAwacsPatrol: (w, slot, [uid, on]) => setAwacsPatrol(w, slot, str(uid, 64), !!on),
    declareWar: (w, slot, [target]) => declareWar(w, slot, num(target)),
    offerPeace: (w, slot, [target]) => offerPeace(w, slot, num(target)),
    respondPeace: (w, slot, [foe, accept]) => respondPeace(w, slot, num(foe), !!accept),
    proposeAlliance: (w, slot, [target]) => proposeAlliance(w, slot, num(target)),
    respondAlliance: (w, slot, [from, accept]) => respondAlliance(w, slot, num(from), !!accept),
    breakAlliance: (w, slot, [target]) => breakAlliance(w, slot, num(target)),
    scrap: (w, slot, [uid]) => scrapUnit(w, slot, str(uid, 64)),
    produceAmmo: (w, slot, [type]) => queueAmmo(w, slot, str(type)),
    cancelProd: (w, slot, [i]) => cancelProd(w, slot, num(i)),
    setWarhead: (w, slot, [uid, type]) => setWarhead(w, slot, str(uid, 64), str(type)),
    // Ground transport load/unload and land march.
    embark: (w, slot, [transportId, groundUnitId]) => embark(w, slot, str(transportId, 64), str(groundUnitId, 64)),
    disembark: (w, slot, [transportId, lng, lat]) => disembark(w, slot, str(transportId, 64), num(lng), num(lat)),
    march: (w, slot, [uid, lng, lat]) => setMarch(w, slot, str(uid, 64), num(lng), num(lat)),
    // Shelter leadership to the bunker / release it back out.
    shelterLeadership: (w, slot) => shelterLeadership(w, slot),
    releaseLeadership: (w, slot) => releaseLeadership(w, slot),
};
