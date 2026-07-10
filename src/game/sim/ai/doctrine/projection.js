// Projection: naval/air power projection for coastal nations with the sailor
// gene. Builds the fleet and full flight decks first, keeps the homeland shield
// adequate rather than deep, and fights its wars from the water.
import {DOCTRINE, WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, groundWants, industryWants, navalWants, offenseWants, radarWants, wantList} from "./lib.js";

export default {
    id: "projection",
    score(frame, personality) {
        if (!frame.me.coastal) return 0;
        if (personality.navalism < DOCTRINE.projectionNavalism) return 0.1;
        return 0.4 + personality.navalism * 0.6;
    },
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar);
        navalWants(list, Math.max(focus.navy, 0.8) * 1.5, {carrierMult: 1});
        defenseWants(list, focus.defense * 0.9);
        offenseWants(list, focus.offense, {siloMult: 0.8});
        ammoWants(list, focus.warheads);
        commandWants(list, 0.8);
        groundWants(list, focus.ground * 0.8);
        return list.items;
    },
    // Decks stay warm even in peacetime — presence is the point.
    patrols: () => ({size: WANTS.patrolSize, awacs: true}),
    scrapBias: {ground: 1.4, offense: 1.1, naval: 0.6},
};
