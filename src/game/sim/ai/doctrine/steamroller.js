// Steamroller: the ground-heavy capture doctrine. A big army with artillery
// weight, forward launchers to interdict, and enough shield to cover the
// advance. Scores when the nation out-armies the foe on a reachable front.
import {DOCTRINE, WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, groundWants, have, industryWants, navalWants, offenseWants, radarWants, wantList} from "./lib.js";

export default {
    id: "steamroller",
    score(frame, personality) {
        let best = 0;
        for (const front of frame.fronts) {
            const p = frame.world.profiles[front.foe];
            if (!p || front.distKm > 4500) continue;
            const mine = 1 + frame.me.units.filter((u) => u.type === "infantry" || u.type === "tank" || u.type === "artillery").length;
            const theirs = 1 + p.ground.count;
            if (mine / theirs >= DOCTRINE.steamrollerRatio) best = Math.max(best, 0.5 + personality.aggression * 0.5);
        }
        return best;
    },
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar);
        groundWants(list, Math.max(focus.ground, 0.8) * 1.8, {targetMult: 1.5, artilleryShare: 0.35});
        defenseWants(list, focus.defense);
        offenseWants(list, focus.offense, {launcherMult: 1.4, siloMult: 0.7});
        ammoWants(list, focus.warheads);
        commandWants(list, 0.7);
        navalWants(list, focus.navy * (have(frame, "amphib") ? 1 : 0.7));
        return list.items;
    },
    patrols: (frame) => ({size: frame.world.atWar ? WANTS.patrolSize : 0, awacs: frame.world.atWar}),
    scrapBias: {naval: 1.4, offense: 1.1, ground: 0.6},
};
