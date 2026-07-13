// Tech registry — unit-unlock gates only.
//
// Techs no longer apply stat buffs to nations. Each entry is metadata plus, on a
// handful of entries, `unlocks: "<unitType>"` mirrored by UNITS[type].requiresTech
// so the production gate can name what's needed. Nations start with every tech
// id in `research.done`, so every gated unit is buildable from the first tick.
// A future upgrade system will attach to units directly, not to techs.

const ERAS = [
    {id: "coldwar", name: "Cold War", tierRange: [1, 4], years: "1947–1991", color: "#4fc3e8"},
    {id: "modern", name: "Modern", tierRange: [5, 8], years: "1991–2035", color: "#f4c02a"},
    {id: "space", name: "Space Age", tierRange: [9, 12], years: "2035+", color: "#b98cff"},
];

function eraForTier(tier) {
    const e = ERAS.find((era) => tier >= era.tierRange[0] && tier <= era.tierRange[1]);
    return e ? e.id : ERAS[ERAS.length - 1].id;
}

function chain(path, defs) {
    const out = {};
    defs.forEach((d, i) => {
        const tier = i + 1;
        out[`${path}${tier}`] = {path, tier, era: eraForTier(tier), ...d};
    });
    return out;
}

// 5 tracks × 12 tiers = 60 techs. Only a handful carry `unlocks` — the rest are
// bookkeeping so unit gate ids (off8, def5, …) keep resolving to a display name.
export const TECHS = {
    ...chain("off", [
        {name: "Fission Warheads"},
        {name: "Thermonuclear Warheads"},
        {name: "ICBM Program"},
        {name: "MIRV Technology"},
        {name: "Precision Guidance (CEP)"},
        {name: "Cruise-Missile Doctrine"},
        {name: "Penetration Aids / Decoys"},
        {name: "Hypersonic Glide Vehicles", unlocks: "hypersonicbty"},
        {name: "Maneuvering Reentry (MaRV)"},
        {name: "Fractional Orbital Bombardment (FOBS)"},
        {name: "Kinetic Orbital Strike", unlocks: "orbitalstrike"},
        {name: "Directed-Energy Strike"},
    ]),
    ...chain("def", [
        {name: "Nike SAM Line"},
        {name: "Anti-Ballistic Missile (Safeguard)"},
        {name: "Layered Interceptors"},
        {name: "Phased-Array Fire Control", unlocks: "mshorad"},
        {name: "Patriot PAC-3", unlocks: "patriot"},
        {name: "Aegis / Standard Missile", unlocks: "aegis"},
        {name: "THAAD", unlocks: "thaad"},
        {name: "Ground-Based Midcourse Defense"},
        {name: "Brilliant Pebbles"},
        {name: "Directed-Energy Defense", unlocks: "laser"},
        {name: "Boost-Phase Intercept"},
        {name: "Integrated Missile Shield"},
    ]),
    ...chain("eco", [
        {name: "War Bonds"},
        {name: "Military-Industrial Complex"},
        {name: "Central Planning"},
        {name: "Nuclear Power", unlocks: "sub-ssn"},
        {name: "Just-in-Time Logistics", unlocks: "amphib"},
        {name: "Globalized Supply Chains"},
        {name: "Industrial Automation"},
        {name: "Additive Manufacturing"},
        {name: "Fusion Power"},
        {name: "Orbital Mining"},
        {name: "AI-Managed Economy"},
        {name: "Post-Scarcity War Machine"},
    ]),
    ...chain("det", [
        {name: "DEW-Line Radar"},
        {name: "Over-the-Horizon Backscatter"},
        {name: "BMEWS"},
        {name: "Space-Based Infrared (SBIRS)", unlocks: "reconsat"},
        {name: "AWACS Datalink"},
        {name: "Multi-Sensor Fusion"},
        {name: "Multi-Spectral Tracking"},
        {name: "Networked Sensor Fusion"},
        {name: "Persistent Orbital Constellation"},
        {name: "Hypersonic Tracking Layer"},
        {name: "Quantum Radar"},
        {name: "Global Surveillance Grid"},
    ]),
    ...chain("cmd", [
        {name: "SAGE Network"},
        {name: "Nuclear Triad Doctrine", unlocks: "sub-ssbn"},
        {name: "Mobile Launchers"},
        {name: "NORAD Hardened Bunkers"},
        {name: "GPS / PNT"},
        {name: "Network-Centric Warfare"},
        {name: "Real-Time C4ISR"},
        {name: "Drone Command"},
        {name: "Autonomous Battle Management"},
        {name: "AI Decision Support"},
        {name: "Space Command", unlocks: "spacehq"},
        {name: "Grand Strategy"},
    ]),
};
