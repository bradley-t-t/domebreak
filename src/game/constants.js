// System catalogue. Costs mirror the server (COST in the edge function); the
// server is authoritative, this is for display and budgeting in the UI.
export const TOOLS = {
  silo: { label: "Silo", cost: 300, offense: true, glyph: "▲", hint: "Launch a warhead at an enemy city" },
  interceptor: { label: "Interceptor", cost: 200, offense: false, glyph: "◆", hint: "Downs incoming warheads nearby" },
  radar: { label: "Radar", cost: 150, offense: false, glyph: "❉", hint: "Boosts interceptors in range" },
  dome: { label: "Golden Dome", cost: 400, offense: false, glyph: "⬡", hint: "Strong shield over one city" },
};
export const SLOT_COLOR = { 0: "#4aa3ff", 1: "#ff5d5d" };
