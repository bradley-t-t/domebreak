// Tech tree registry.

// --- Eras -----------------------------------------------------------------
// Three chronological eras band the 12 research tiers (4 tiers each). ERAS is
// metadata for the tech-tree UI's era banding — id, display name, inclusive tier
// range [lo, hi], flavor years, and a band color. Tech entries carry a matching
// `era` id so the UI can group lanes without recomputing the tier→era mapping.
const ERAS = [
    {id: "coldwar", name: "Cold War", tierRange: [1, 4], years: "1947–1991", color: "#4fc3e8"},
    {id: "modern", name: "Modern", tierRange: [5, 8], years: "1991–2035", color: "#f4c02a"},
    {id: "space", name: "Space Age", tierRange: [9, 12], years: "2035+", color: "#b98cff"},
];

// Era id for a given 1-based tier (drives the `era` tag on every tech).
function eraForTier(tier) {
    const e = ERAS.find((era) => tier >= era.tierRange[0] && tier <= era.tierRange[1]);
    return e ? e.id : ERAS[ERAS.length - 1].id;
}

// --- Tech cost / time scaling ---------------------------------------------
// Costs and research times escalate super-linearly with tier, so the deeper a tech,
// the harder and slower it is to reach. Every tech's cost/time derives from its tier
// via these knobs unless it supplies an explicit override.
//   cost(tier) = round(TECH_COST_BASE * TECH_COST_GROWTH ^ (tier-1))
//   time(tier) = round(TECH_TIME_BASE * TECH_TIME_GROWTH ^ (tier-1))
const TECH_COST_BASE = 540;
const TECH_COST_GROWTH = 1.40;
const TECH_TIME_BASE = 48;
const TECH_TIME_GROWTH = 1.30;

// Derive the escalating research cost (points) for a 1-based tier.
function techCostForTier(tier) {
    return Math.round(TECH_COST_BASE * TECH_COST_GROWTH ** (tier - 1));
}

// Derive the escalating research time (seconds) for a 1-based tier.
function techTimeForTier(tier) {
    return Math.round(TECH_TIME_BASE * TECH_TIME_GROWTH ** (tier - 1));
}

// Build a linear tech chain for a track. Each def is a 1-based tier; tier N
// requires tier N-1. cost/time default to the tier-derived scaling curve above
// (per-def `cost`/`time` overrides win), and `era` is tagged from the tier.
function chain(path, defs) {
    const out = {};
    defs.forEach((d, i) => {
        const tier = i + 1;
        out[`${path}${tier}`] = {
            path,
            tier,
            req: i ? `${path}${i}` : null,
            era: eraForTier(tier),
            cost: techCostForTier(tier),
            time: techTimeForTier(tier),
            ...d, // per-tech cost/time/other overrides take precedence
        };
    });
    return out;
}

// 5 tracks × 12 tiers = 60 techs. Tiers 1–4 Cold War, 5–8 Modern, 9–12 Space
// Age. Each tech either boosts a nation multiplier (`apply`), unlocks a
// tech-gated unit (`unlocks: "<unitType>"` ↔ UNITS[type].requiresTech), or both.
// Cost/time come from the tier-scaling curve unless overridden.
export const TECHS = {
    // Strategic Command (off) — offense / strike.
    ...chain("off", [
        {name: "Fission Warheads", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Thermonuclear Warheads", desc: "+20% strike damage", apply: (n) => (n.dmgMult *= 1.2)},
        {name: "ICBM Program", desc: "+30% missile range", apply: (n) => (n.rangeMult *= 1.3)},
        {name: "MIRV Technology", desc: "+20% strike damage", apply: (n) => (n.dmgMult *= 1.2)},
        {name: "Precision Guidance (CEP)", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Cruise-Missile Doctrine", desc: "-15% reload time", apply: (n) => (n.reloadMult *= 0.85)},
        {name: "Penetration Aids / Decoys", desc: "+25% missile range", apply: (n) => (n.rangeMult *= 1.25)},
        {
            name: "Hypersonic Glide Vehicles",
            desc: "Unlocks the Hypersonic Missile Battery.",
            unlocks: "hypersonicbty",
            apply: (n) => (n.hypersonicEvasion += 0.15),
        },
        {name: "Maneuvering Reentry (MaRV)", desc: "+25% strike damage", apply: (n) => (n.dmgMult *= 1.25)},
        {
            name: "Fractional Orbital Bombardment (FOBS)",
            desc: "+30% missile range",
            apply: (n) => (n.rangeMult *= 1.3),
        },
        {
            name: "Kinetic Orbital Strike",
            desc: "Unlocks the Orbital Strike Platform.",
            unlocks: "orbitalstrike",
            apply: (n) => (n.dmgMult *= 1.15),
        },
        {name: "Directed-Energy Strike", desc: "+30% strike damage", apply: (n) => (n.dmgMult *= 1.3)},
    ]),
    // Missile Shield (def) — defense.
    ...chain("def", [
        {name: "Nike SAM Line", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Anti-Ballistic Missile (Safeguard)", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Layered Interceptors", desc: "+25% defense range", apply: (n) => (n.defRangeMult *= 1.25)},
        {
            name: "Phased-Array Fire Control",
            desc: "+25% interceptor speed",
            apply: (n) => (n.interceptorSpeedMult *= 1.25),
        },
        {name: "Patriot PAC-3", desc: "Unlocks the Patriot Battery.", unlocks: "patriot", apply: (n) => (n.interceptAdd += 0.08)},
        {name: "Aegis / Standard Missile", desc: "Unlocks Aegis Ashore; +10% intercept.", unlocks: "aegis", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "THAAD", desc: "Unlocks the THAAD Battery.", unlocks: "thaad", apply: (n) => (n.defRangeMult *= 1.15)},
        {name: "Ground-Based Midcourse Defense", desc: "+12% intercept", apply: (n) => (n.interceptAdd += 0.12)},
        {name: "Brilliant Pebbles", desc: "Unlocks the Space-Based Interceptor.", unlocks: "sbi", apply: (n) => (n.interceptAdd += 0.08)},
        {name: "Directed-Energy Defense", desc: "Unlocks the Orbital Laser.", unlocks: "orbitallaser", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Boost-Phase Intercept", desc: "+15% intercept", apply: (n) => (n.interceptAdd += 0.15)},
        {name: "Golden Dome Doctrine", desc: "+35% defense range, +10% intercept", apply: (n) => {
            n.defRangeMult *= 1.35;
            n.interceptAdd += 0.1;
        }},
    ]),
    // War Economy (eco).
    ...chain("eco", [
        {name: "War Bonds", desc: "+20% income", apply: (n) => (n.incomeMult *= 1.2)},
        {name: "Military-Industrial Complex", desc: "+20% income", apply: (n) => (n.incomeMult *= 1.2)},
        {name: "Central Planning", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {
            name: "Nuclear Power",
            desc: "Nuclear propulsion — unlocks the Attack Submarine (SSN); -15% upkeep.",
            unlocks: "sub-ssn",
            apply: (n) => (n.upkeepMult *= 0.85),
        },
        {
            name: "Just-in-Time Logistics",
            desc: "Unlocks the Amphibious Transport & Replenishment Ship; -15% upkeep.",
            unlocks: "amphib",
            apply: (n) => (n.upkeepMult *= 0.85),
        },
        {name: "Globalized Supply Chains", desc: "+25% income", apply: (n) => (n.incomeMult *= 1.25)},
        {name: "Industrial Automation", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Additive Manufacturing", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Fusion Power", desc: "+30% income", apply: (n) => (n.incomeMult *= 1.3)},
        {name: "Orbital Mining", desc: "+30% income", apply: (n) => (n.incomeMult *= 1.3)},
        {name: "AI-Managed Economy", desc: "-20% upkeep", apply: (n) => (n.upkeepMult *= 0.8)},
        {name: "Post-Scarcity War Machine", desc: "+35% income, -15% build cost", apply: (n) => {
            n.incomeMult *= 1.35;
            n.buildCostMult *= 0.85;
        }},
    ]),
    // Early Warning (det) — detection. Later tiers scale sonarKm (ASW) via sonarMult.
    ...chain("det", [
        {name: "DEW-Line Radar", desc: "+25% radar coverage", apply: (n) => (n.radarMult *= 1.25)},
        {name: "Over-the-Horizon Backscatter", desc: "+30% radar coverage", apply: (n) => (n.radarMult *= 1.3)},
        {name: "BMEWS", desc: "+20% radar coverage", apply: (n) => (n.radarMult *= 1.2)},
        {
            name: "Early-Warning Satellite (DSP)",
            desc: "Unlocks the Missile-Warning Satellite.",
            unlocks: "warnsat",
            apply: (n) => (n.radarMult *= 1.1),
        },
        {name: "AWACS Datalink", desc: "+15% intercept", apply: (n) => (n.interceptAdd += 0.15)},
        {
            name: "Space-Based Infrared (SBIRS)",
            desc: "Unlocks the Reconnaissance Satellite.",
            unlocks: "reconsat",
            apply: (n) => (n.radarMult *= 1.15),
        },
        {name: "Multi-Spectral Tracking", desc: "+25% ASW sonar range", apply: (n) => (n.sonarMult *= 1.25)},
        {name: "Networked Sensor Fusion", desc: "+30% ASW sonar range, +20% radar coverage", apply: (n) => {
            n.sonarMult *= 1.3;
            n.radarMult *= 1.2;
        }},
        {name: "Persistent Orbital Constellation", desc: "+30% radar coverage", apply: (n) => (n.radarMult *= 1.3)},
        {name: "Hypersonic Tracking Layer", desc: "+30% interceptor speed", apply: (n) => (n.interceptorSpeedMult *= 1.3)},
        {name: "Quantum Radar", desc: "+35% ASW sonar range", apply: (n) => (n.sonarMult *= 1.35)},
        {name: "Global Surveillance Grid", desc: "+40% radar coverage, +25% ASW sonar range", apply: (n) => {
            n.radarMult *= 1.4;
            n.sonarMult *= 1.25;
        }},
    ]),
    // Command & Control (cmd).
    ...chain("cmd", [
        {name: "SAGE Network", desc: "+20% research speed", apply: (n) => (n.researchSpeedMult *= 1.2)},
        {
            name: "Nuclear Triad Doctrine",
            desc: "Unlocks the Ballistic Missile Sub (SSBN) — the sea leg of the triad.",
            unlocks: "sub-ssbn",
            apply: (n) => (n.dmgMult *= 1.1),
        },
        {name: "Mobile Launchers", desc: "-40% relocation cost", apply: (n) => (n.moveCostMult *= 0.6)},
        {name: "NORAD Hardened Bunkers", desc: "-15% upkeep", apply: (n) => (n.upkeepMult *= 0.85)},
        {name: "GPS / PNT", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Network-Centric Warfare", desc: "+20% radar coverage", apply: (n) => (n.radarMult *= 1.2)},
        {name: "Real-Time C4ISR", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Drone Command", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Autonomous Battle Management", desc: "+25% interceptor speed", apply: (n) => (n.interceptorSpeedMult *= 1.25)},
        {name: "AI Decision Support", desc: "+25% research speed", apply: (n) => (n.researchSpeedMult *= 1.25)},
        {
            name: "Space Command",
            desc: "Unlocks the Space Command HQ — prerequisite for all orbital assets.",
            unlocks: "spacehq",
            apply: (n) => (n.researchSpeedMult *= 1.1),
        },
        {name: "Grand Strategy", desc: "+15% strike damage, +10% intercept", apply: (n) => {
            n.dmgMult *= 1.15;
            n.interceptAdd += 0.1;
        }},
    ]),
};
