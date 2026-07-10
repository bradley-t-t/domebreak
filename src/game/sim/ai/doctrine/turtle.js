// Turtle: the outmatched small nation. A layered wall over everything worth
// keeping, deep radar, a minimal deterrent so wars against it stay expensive,
// and no adventures. Scores high for small or clearly outgunned nations and for
// the deeply paranoid.
import {DOCTRINE, WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, groundWants, industryWants, navalWants, offenseWants, radarWants, wantList} from "./lib.js";

export default {
    id: "turtle",
    score(frame, personality, posture) {
        let s = 0.2 + personality.paranoia * 0.3;
        if (frame.me.cities.length <= DOCTRINE.smallNationCities) s += 0.5;
        if (posture.mode === "turtle") s += 0.6;
        return s;
    },
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar * 1.3);
        defenseWants(list, focus.defense * 1.6, 1.2);
        commandWants(list, 1);                              // bunker early — the head stays down
        offenseWants(list, focus.offense * 0.6, {siloMult: 0.5, launcherMult: 0.7, hyperMult: 0.5});
        ammoWants(list, focus.warheads * 0.8);
        groundWants(list, focus.ground * 0.7, {targetMult: 0.6});
        navalWants(list, focus.navy * 0.5);
        return list.items;
    },
    patrols: () => ({size: WANTS.patrolSize, awacs: true}),
    scrapBias: {offense: 1.4, naval: 1.3, ground: 1.2, defense: 0.6},
};
