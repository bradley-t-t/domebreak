// Wiki data — derived directly from the in-game unit registry so nothing can
// drift out of sync with the sim. The wiki view (rows, tiles, stat rows) is
// built from these records; the numbers themselves come from the source of
// truth in src/game/data/units.js.
import {UNITS, UNIT_ICON} from "@game/game/data/units.js";

// Category buckets used by the wiki UI. `include` lists every unit id we
// surface, in the order they should render inside the section. Any unit id not
// listed anywhere is intentionally hidden from the wiki (e.g. roster entries
// that aren't actually reachable yet — no wing carries them, nothing builds
// them).
export const CATEGORIES = [
    {
        id: "defense",
        label: "Missile Defense",
        blurb: "Interceptors, area defense, and the layered shield.",
        include: ["battery", "patriot", "aegis", "thaad", "dome", "orbitallaser"],
    },
    {
        id: "offense",
        label: "Strike & Offense",
        blurb: "Ballistic missiles, hypersonics, and orbital bombardment.",
        include: ["launcher", "silo", "hypersonicbty", "orbitalstrike"],
    },
    {
        id: "sensors",
        label: "Sensors & Warning",
        blurb: "Radars and satellites that build the picture.",
        include: ["radar", "oth", "reconsat"],
    },
    {
        id: "naval",
        label: "Naval",
        blurb: "Surface fleet, amphibs, and the submarine leg of the triad.",
        include: ["cruiser", "destroyer", "battleship", "carrier", "amphib", "replenish", "sub-ssn", "sub-ssbn"],
    },
    {
        id: "air",
        label: "Air Wing",
        blurb: "Fixed-wing and rotary aircraft flown from carriers, airstrips, and army bases.",
        include: ["interceptor", "strikefighter", "carrierfighter", "attack", "awacs", "transport", "helo", "transporthelo"],
    },
    {
        id: "ground",
        label: "Ground Forces",
        blurb: "Infantry, armor, and artillery that seize and hold ground.",
        include: ["infantry", "tank", "artillery"],
    },
    {
        id: "command",
        label: "Command & Bases",
        blurb: "The buildings that anchor the war effort.",
        include: ["airstrip", "armybase", "bunker", "spacehq"],
    },
    {
        id: "industry",
        label: "Industry",
        blurb: "Non-combat economy — every silo is paid for.",
        include: ["factory", "port", "refinery", "techpark"],
    },
];

// Every warhead-firing platform picks from these display names. The keys are
// the ammo ids in units.js (`ammo: ["standard", "cluster", "thermo",
// "thermomirv"]`) — kept here so a wiki reader sees the same names the sim
// uses in-game, without having to import the warhead registry.
const WARHEAD_LABEL = {
    standard: "Standard",
    cluster: "Cluster",
    thermo: "Thermonuclear",
    thermomirv: "Thermo MIRV",
    hgv: "Hypersonic Glide Vehicle",
    sicbm: "SICBM",
};

// Display label for the platform an air unit is fielded from. Derived by
// scanning every unit's `wing` list — a fighter's home is the first hull whose
// wing lists it. Returns null when nothing carries the unit.
function deployedFromLabel(id) {
    const carriers = [];
    for (const [carrierId, u] of Object.entries(UNITS)) {
        if (Array.isArray(u.wing) && u.wing.includes(id)) carriers.push(UNITS[carrierId].label);
    }
    return carriers.length ? carriers.join(" / ") : null;
}

// Human-friendly, unit-suffixed value used in the mini stats table. Numbers
// come straight from the sim so the wiki cannot round or invent a value.
function fmt(n, unit) {
    if (n == null) return null;
    const s = Number.isInteger(n) ? String(n) : String(n);
    return unit ? `${s} ${unit}` : s;
}

// Build the ordered stats rows for a source unit. Every branch reads a field
// that actually exists on the game unit — nothing is fabricated. Blank
// entries drop out (falsy filter below) so a card only shows the numbers that
// apply to that platform.
function buildStats(u) {
    const rows = [];

    // Weapon reach + payload — offensive platforms.
    if (u.range != null && u.damage != null) {
        rows.push(["Weapon range", fmt(u.range, "km")]);
        rows.push(["Damage", fmt(u.damage)]);
    }
    // Defensive engagement window — interceptors + area defense.
    if (u.range != null && u.intercept != null) {
        const rangeLabel = u.minRange
            ? `${u.minRange} – ${u.range} km`
            : fmt(u.range, "km");
        rows.push(["Engagement range", rangeLabel]);
        rows.push(["Intercept chance", `${Math.round(u.intercept * 100)}%`]);
        if (u.antiBallistic) rows.push(["Anti-ballistic", "Yes"]);
    }
    // Sensor-only platforms: radars, warnsats, reconsats.
    if (u.detect && u.intercept == null && u.damage == null) {
        rows.push(["Detection range", fmt(u.range, "km")]);
        rows.push(["Cues interceptors", u.warnOnly ? "No — warning only" : "Yes"]);
    }
    // Weapon cycle.
    if (u.reload != null) rows.push(["Reload", fmt(u.reload, "s")]);
    if (u.fireCost != null) rows.push(["Fire cost", fmt(u.fireCost)]);

    // Movement speed — a platform has at most one of these.
    if (u.airSpeed != null) rows.push(["Air speed", fmt(u.airSpeed, "km/s")]);
    if (u.navalSpeed != null) rows.push(["Cruise speed", fmt(u.navalSpeed, "km/s")]);
    if (u.landSpeed != null) rows.push(["Ground speed", fmt(u.landSpeed, "km/s")]);

    // Sensors carried by the platform itself.
    if (u.radarKm && !u.detect) rows.push(["Organic radar", fmt(u.radarKm, "km")]);
    if (u.sonarKm) rows.push(["ASW sonar", fmt(u.sonarKm, "km")]);

    // Naval logistics.
    if (u.capacity) rows.push(["Embark capacity", `${u.capacity} ground units`]);
    if (u.resupplyKm) rows.push(["Resupply range", fmt(u.resupplyKm, "km")]);

    // Stealth flag — submarine hulls only reveal to sonar.
    if (u.submarine) rows.push(["Stealth", "Submerged — invisible to radar"]);

    // Ground unit specials.
    if (u.capture) rows.push(["Can capture cities", "Yes"]);

    // Industry — income and GDP contribution.
    if (u.output != null) rows.push(["Income", `+${u.output} pts/s`]);
    if (u.gdpAdd != null) rows.push(["GDP", `+$${u.gdpAdd.toFixed(2)} T`]);
    if (u.coastal) rows.push(["Sited", "Coastal only"]);

    // Air wing carried by hangar-style buildings and carriers.
    if (Array.isArray(u.wing) && u.wing.length) {
        rows.push(["Fields the wing", u.wing.map((w) => UNITS[w]?.label).filter(Boolean).join(" · ")]);
    }

    // Armament for warhead-picker platforms.
    if (Array.isArray(u.ammo) && u.ammo.length) {
        rows.push(["Armament", u.ammo.map((a) => WARHEAD_LABEL[a] || a).join(" / ")]);
    }

    return rows;
}

// A single wiki row, denormalized from the source unit so the view layer never
// touches the game registry directly.
function buildEntry(id) {
    const u = UNITS[id];
    if (!u) return null;
    const deployedFrom = deployedFromLabel(id);
    const requires = u.requires ? UNITS[u.requires]?.label : null;
    const requiresUnit = u.requiresUnit ? UNITS[u.requiresUnit]?.label : null;
    return {
        id,
        icon: UNIT_ICON[id] || id,
        label: u.label,
        summary: u.desc || null,
        cost: u.cost,
        upkeep: u.upkeep,
        buildTime: u.buildTime,
        hp: u.hp,
        maxCount: u.maxCount || null,
        // A hangar-style unit "deploys" its wing; a ground-force unit "requires"
        // a base. We only surface the one that applies.
        deployedFrom,
        requiresUnit: requiresUnit || (requires ? requires : null),
        stats: buildStats(u),
    };
}

// Full ordered wiki roster — one entry per unit id, in the order declared on
// each category's `include` list. Categories with no reachable units drop out.
export const CATEGORIES_WITH_UNITS = CATEGORIES.map((c) => ({
    ...c,
    units: c.include.map(buildEntry).filter(Boolean),
})).filter((c) => c.units.length > 0);

// Flattened list — used for "All" mode in the WikiPage.
export const UNITS_LIST = CATEGORIES_WITH_UNITS.flatMap((c) => c.units);
