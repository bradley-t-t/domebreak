// System catalogue. Costs mirror the server (authoritative); shown here for UI budgeting.
export const TOOLS = {
  silo: { label: "Silo", cost: 300, offense: true, glyph: "▲", hint: "Launch a warhead at an enemy city" },
  interceptor: { label: "Interceptor", cost: 200, offense: false, glyph: "◆", hint: "Downs incoming warheads nearby" },
  radar: { label: "Radar", cost: 150, offense: false, glyph: "❉", hint: "Boosts interceptors in range" },
  dome: { label: "Golden Dome", cost: 400, offense: false, glyph: "⬡", hint: "Strong shield over one city" },
};
// Up to 16 participants, each a distinct, readable color on the dark map.
export const SLOT_COLOR = {
  0: "#4aa3ff", 1: "#ff5d5d", 2: "#f4c02a", 3: "#46d38a", 4: "#b57bff", 5: "#ff9f43",
  6: "#2ee6d6", 7: "#ff6ec7", 8: "#8ed14a", 9: "#5c7cfa", 10: "#ff8a5c", 11: "#c0e05a",
  12: "#e05a9c", 13: "#5ad1e0", 14: "#d98cff", 15: "#ffd05a",
};
export const MAX_SLOTS = 16;
