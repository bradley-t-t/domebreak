// Space: the high-GDP orbital path — Space Command HQ, recon constellation,
// orbital laser shield, and the kinetic strike platform. Almost always runs as
// an overlay on another doctrine; leads only for the truly space-obsessed rich.
import {DOCTRINE, WANTS} from "../tuning.js";
import {ammoWants, commandWants, defenseWants, industryWants, offenseWants, radarWants, spaceWants, wantList} from "./lib.js";

export default {
    id: "space",
    score(frame, personality) {
        if (frame.me.gdp < DOCTRINE.spaceGdpMin || personality.spaceRush < DOCTRINE.spaceRushMin) return 0;
        return 0.3 + personality.spaceRush * 0.5;
    },
    wants(frame, focus) {
        const list = wantList(frame);
        industryWants(list, focus.economy);
        radarWants(list, focus.radar);
        spaceWants(list, Math.max(focus.space, 1) * 1.6);
        defenseWants(list, focus.defense * 0.9);
        offenseWants(list, focus.offense * 0.9);
        ammoWants(list, focus.warheads);
        commandWants(list, 0.8);
        return list.items;
    },
    patrols: (frame) => ({size: frame.world.atWar ? WANTS.patrolSize : 0, awacs: frame.world.atWar}),
    scrapBias: {ground: 1.3, naval: 1.2},
};
