// The unit icons a commander can pick as a profile picture. These are the SVG
// slugs under public/icons/ (same art UnitIcon renders). Curated to the
// recognizable hardware — a commander's "insignia" — and ordered for the picker
// grid. Server validation (db-account set_avatar) only bounds the shape, so this
// list is the single source of what the UI offers.
export const AVATAR_ICONS = [
    "aegis", "thaad", "patriot", "battery", "silo", "hypersonic",
    "interceptor", "orbitalstrike", "spacehq",
    "jet", "strike-fighter", "awacs", "helo", "bunker", "radar", "oth",
    "reconsat", "tank", "artillery", "infantry", "armybase",
    "carrier", "battleship", "destroyer", "cruiser", "sub-ssbn", "sub-ssn",
    "amphib", "port", "factory", "techpark", "refinery",
];
