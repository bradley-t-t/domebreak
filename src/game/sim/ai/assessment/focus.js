// Focus: how the next budget window splits across the spending axes, as a
// weight vector the doctrine wants are scaled by. Reactive by construction —
// the enemy profiles push it around: a first-strike neighbour raises defense
// and radar, a steamroller raises ground, live inbound pressure raises both.
export const AXES = ["economy", "radar", "defense", "offense", "warheads", "ground", "air", "navy", "space"];

export function assessFocus(frame, posture, personality) {
    const f = {economy: 1, radar: 0.6, defense: 0.8, offense: 0.6, warheads: 0.5, ground: 0.4, air: 0.4, navy: 0.2, space: 0.1};

    // Economy tapers as the industrial base fills; industrialists hold it longer.
    const indFill = Math.min(1, frame.me.units.filter((u) => ["factory", "port", "refinery", "techpark"].includes(u.type)).length / Math.max(1, frame.me.indCap));
    f.economy *= (1.4 - indFill) * (0.7 + 0.6 * personality.industrialism);

    // Paranoia and live threat pressure raise the shield.
    f.defense *= (0.7 + 0.6 * personality.paranoia) * (1 + Math.min(1.5, frame.pressure / 40));
    f.radar *= 0.7 + 0.6 * personality.paranoia;

    // What the neighbours field reshapes the answer: strike-heavy profiles pull
    // defense/radar up; ground-heavy profiles pull ground defense up. Allies
    // don't count — their arsenals aren't pointed at us.
    for (const slot in frame.world.profiles) {
        if (frame.n.relations[slot] === "ally") continue;
        const p = frame.world.profiles[slot];
        const w = frame.world.enemies.some((e) => e.slot === +slot) ? 1 : 0.4;
        if (p.posture === "first-strike") { f.defense += 0.5 * w; f.radar += 0.3 * w; }
        if (p.posture === "steamroller") { f.ground += 0.5 * w; f.defense += 0.2 * w; }
        if (p.posture === "aggressive") { f.defense += 0.2 * w; f.offense += 0.2 * w; }
    }

    // Posture skew.
    const mode = posture.mode;
    if (mode === "turtle") { f.defense *= 1.6; f.radar *= 1.3; f.offense *= 0.5; f.ground *= 0.6; }
    if (mode === "press") { f.offense *= 1.3; f.warheads *= 1.3; }
    if (mode === "blitz") { f.offense *= 1.5; f.warheads *= 1.5; f.ground *= 1.5; }
    if (mode === "decap") { f.offense *= 1.6; f.warheads *= 1.7; }

    // Domain appetites.
    if (frame.me.coastal) f.navy = (0.3 + personality.navalism) * (frame.world.atWar ? 1.2 : 0.9);
    else f.navy = 0;
    f.air *= 0.8 + 0.5 * posture.aggression;
    f.space = personality.spaceRush * Math.min(1.5, frame.me.gdp / 8);

    // Bound every axis so a stack of hot multipliers can't turn one appetite
    // into a runaway urgency that starves the rest of the doctrine.
    for (const k in f) f[k] = Math.min(2, f[k]);
    return f;
}
