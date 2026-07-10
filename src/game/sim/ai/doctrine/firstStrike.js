// First Strike: the arsenal doctrine. Silos, hypersonics, and deep magazines —
// counterforce weight over wall depth. Scores for decap-minded nations and
// stacks as a sub-doctrine on anyone prosecuting a war from strength.
import {DOCTRINE, WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, groundWants, industryWants, offenseWants, radarWants, wantList} from "./lib.js";

export default {
    id: "firstStrike",
    score(frame, personality, posture) {
        let s = personality.decapFocus >= DOCTRINE.firstStrikeDecap ? 0.45 + personality.decapFocus * 0.4 : 0.15;
        if (posture.mode === "decap") s += 0.5;
        if (posture.mode === "blitz") s += 0.2;
        return s;
    },
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar);
        offenseWants(list, Math.max(focus.offense, 0.8) * 1.7, {siloMult: 1.5, hyperMult: 1.5});
        ammoWants(list, Math.max(focus.warheads, 0.8) * 1.5, 1.4);
        defenseWants(list, focus.defense * 0.9);
        commandWants(list, 0.9);                            // a striker expects the counterstrike
        groundWants(list, focus.ground * 0.6, {targetMult: 0.6});
        return list.items;
    },
    patrols: (frame) => ({size: frame.world.atWar ? WANTS.patrolSize : 0, awacs: frame.world.atWar}),
    scrapBias: {ground: 1.4, naval: 1.3, offense: 0.6},
};
