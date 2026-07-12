// Warhead registry.
import { UNITS } from "./units.js";

// Map warhead type -> public/icons SVG basename (production queue + arsenal UI).
export const WARHEAD_ICON = {standard: "wh-standard", cluster: "wh-cluster", hgv: "wh-hgv", thermo: "wh-thermo", sicbm: "wh-standard", thermomirv: "wh-thermo"};

// Offensive munitions. Strikes consume a warhead of the loaded type; each has
// its own production cost/time, damage multiplier, and (for effect) flame color.
export const WARHEADS = {
    standard: {
        name: "Conventional",
        short: "CONV",
        role: "Balanced",   // one-word niche, surfaced on the payload picker chip
        dmgMult: 1.0,
        prodCost: 30,
        prodTime: 4,
        blastKm: 70,        // ground-zero blast radius; units inside take proximity-scaled damage
        flame: "#ff8a1a",   // exhaust/glow tint (SkyLayer --flame); trail is the smoke-plume color
        trail: "#e3e7ec",
        trailW: 2.4,
        desc: "Conventional single warhead. Cheap and quick to build."
    },
    cluster: {
        name: "Cluster",
        short: "CLU",
        role: "Area",
        mirv: true,         // splits into submunitions at reentry
        dmgMult: 0.75,
        prodCost: 55,
        prodTime: 6,
        splash: 240,
        subCount: 8,
        spread: 300,
        subDmgFrac: 0.25,   // each sub-warhead carries this fraction of the bus damage
        primaryShare: 0.5,  // share of subs that stay on the primary target; the rest fan out
        blastKm: 0,         // area comes from the MIRV pattern (splash), not a single blast
        flame: "#ffd23f",   // warm gold — a scattering-bomblet hue, kept clear of THAAD's cyan interceptor
        trail: "#f2e4b0",
        trailW: 2.2,
        desc: "MIRV bus — splits into 8 warheads on reentry; half strike the target, half fan out to nearby targets."
    },
    hgv: {
        name: "Hypersonic Missile",
        short: "HYP",
        role: "Fast",
        dmgMult: 1.6,
        prodCost: 90,
        prodTime: 8,
        blastKm: 90,        // kinetic terminal impact — a tight, hard-hitting blast
        evasion: 0.32,      // maneuvering glide body; added to the projectile's intercept-evasion
        speedMult: 2.0,     // boost-glide overspeed — multiplies the firing platform's projectile speed (2x other missiles)
        flame: "#b98cff",
        trail: "#cdb8ff",   // thin ionization streak — a glide body, not a rocket plume
        trailW: 1.7,
        desc: "Maneuvering kinetic glide body — the fastest round in the arsenal and very hard to intercept. The Hypersonic Battery's signature round."
    },
    thermo: {
        name: "Thermonuclear",
        short: "THR",
        role: "Heavy",
        dmgMult: 2.4,
        prodCost: 130,
        prodTime: 11,
        blastKm: 170,       // vast fireball — a wide blast on top of the lingering fallout cloud
        flame: "#ff3b6b",
        trail: "#ffcdd6",   // heavy, dense plume off a big booster
        trailW: 3.0,
        desc: "City-killer yield. Expensive and slow to produce."
    },
    // Single heavy ballistic round of the road-mobile TEL — bigger warhead than a
    // conventional ICBM, shorter reach than a silo. Single-round, so no warhead picker.
    sicbm: {
        name: "SICBM",
        short: "SICBM",
        role: "Mobile",
        dmgMult: 1.4,
        prodCost: 55,
        prodTime: 6,
        blastKm: 100,
        flame: "#ffb24d",
        trail: "#e3e7ec",
        trailW: 2.6,
        desc: "Road-mobile short-range ballistic missile with a heavy single warhead. Fired by the TEL."
    },
    // Thermonuclear MIRV — a multi-warhead strategic bus. Splits into a few thermo
    // sub-warheads (fewer than a conventional Cluster), each leaving fallout: a
    // multi-city capstone strike, not single-target overkill.
    thermomirv: {
        name: "Thermonuclear MIRV",
        short: "TMRV",
        role: "Heavy MIRV",
        mirv: true,
        dmgMult: 2.4,
        prodCost: 210,
        prodTime: 17,
        splash: 280,
        subCount: 3,
        spread: 320,
        subDmgFrac: 0.6,    // each thermo sub carries this fraction of the bus damage
        primaryShare: 0.34, // ~1 of 3 subs stays on the primary; the rest fan to other cities
        blastKm: 120,
        flame: "#ff3b6b",
        trail: "#ffcdd6",
        trailW: 3.0,
        desc: "Multi-warhead thermonuclear bus — splits into three city-killers on reentry, each leaving fallout."
    },
};
// Ground-zero blast: on detonation every unit within a warhead's blastKm takes
// proximity-scaled damage — a fraction of the yield at the core, linearly down to
// the edge — on top of the direct hit. Cities keep direct-hit-only so the
// scoring/economy balance is untouched.
export const BLAST = {
    aoeShare: 0.6,   // peak blast damage as a fraction of the warhead's full yield, at ground zero
    edgeFrac: 0.3,   // fraction of that peak still dealt at the blast edge (0..1); core is 1
};
// Fraction of flight at which a MIRV bus (cluster / thermo-MIRV) releases its
// warheads — split early so the submunitions fan out over a long terminal run.
export const MIRV_SPLIT_AT = 0.3;
// Warhead display/cycling order (arsenal UI, loadout toggles).
export const WARHEAD_ORDER = ["standard", "cluster", "thermo", "thermomirv", "hgv", "sicbm"];
// Warhead stockpile every nation starts the match with.
export const AMMO_START = {standard: 6, cluster: 0, thermo: 0, thermomirv: 0, hgv: 0, sicbm: 0};

// Which strategic warheads each launcher may load. Warhead-capable units carry an
// explicit `ammo` allow-list; anything else falls back to the full order. The strike
// UI, fire logic, and setWarhead command all gate on this, so a platform can never
// load — or be shown — a payload it cannot carry.
export function allowedAmmo(type) {
    return UNITS[type]?.ammo || WARHEAD_ORDER;
}
// The warhead a freshly built platform comes loaded with. Platforms default to the
// cheap Standard round; a strategic-only platform not cleared for Standard (the
// SSBN) loads its signature round instead — so the default is never a payload the
// platform can't carry.
export function initialWarhead(type) {
    const u = UNITS[type];
    if (!u?.warheads) return "standard";
    const allowed = allowedAmmo(type);
    if (allowed.includes("standard")) return "standard";
    return u.signature && allowed.includes(u.signature) ? u.signature : allowed[0];
}
// Reverse map for the production arsenal: the launcher unit types that can fire a
// given warhead, in canonical unit order. Drives each munition card's "fires from"
// icon row.
export function launchersForAmmo(key) {
    return Object.keys(UNITS).filter((t) => UNITS[t].warheads && allowedAmmo(t).includes(key));
}

// Radioactive fallout: certain warheads scatter long-lived contamination at ground
// zero. The resulting cloud drifts on the prevailing wind and irradiates every city
// and unit inside it — friend or foe alike — for damage over time until it decays.
export const FALLOUT = {
    warheads: ["thermo", "thermomirv"],   // warhead keys that leave a fallout cloud on impact
    radiusKm: 240,          // contamination radius at ground zero
    lifeSec: 80,            // sim seconds the cloud lingers before full decay
    riseSec: 6,             // seconds to reach peak intensity after detonation
    fadeFrac: 0.55,         // fraction of life spent at peak before decay begins
    dmgPerSec: 2.2,         // hp/sec at the cloud core, at peak intensity
    edgeFalloff: 0.35,      // intensity retained at the cloud edge (0..1); core is 1
    driftKmPerSec: 1.1,     // prevailing-wind drift speed of the cloud center
    driftHeadingDeg: 90,    // drift bearing (90 = due east / westerlies)
};
