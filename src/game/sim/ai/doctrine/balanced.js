// Balanced: the midcap default — economy first, then a proportionate mix of
// early warning, layered defense, a credible strike arm, and a small army.
// Every other doctrine is a deliberate skew away from this one.
import {WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, groundWants, industryWants, navalWants, offenseWants, radarWants, spaceWants, wantList} from "./lib.js";

export default {
    id: "balanced",
    score: () => 0.5,
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar);
        defenseWants(list, focus.defense);
        offenseWants(list, focus.offense);
        ammoWants(list, focus.warheads);
        commandWants(list, 0.8);
        groundWants(list, focus.ground);
        navalWants(list, focus.navy);
        spaceWants(list, focus.space);
        return list.items;
    },
    patrols: (frame) => ({size: frame.world.atWar ? WANTS.patrolSize : 0, awacs: frame.world.atWar}),
    scrapBias: {},
};
