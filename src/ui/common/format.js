// Shared display formatters for HUD/console/panel readouts. Keep these pure —
// they render engine numbers, never compute gameplay values.

// Compact population: 1.34B / 82M / 640K, plain integer below a thousand.
export const fmtPop = (p) => (p >= 1e9 ? (p / 1e9).toFixed(2) + "B" : p >= 1e6 ? (p / 1e6).toFixed(0) + "M" : p >= 1e3 ? (p / 1e3).toFixed(0) + "K" : "" + Math.round(p || 0));

// Signed net-economy figure ("+12" / "−3.5") — real minus sign, matching the HUD type.
export const fmtNet = (net, decimals = 0) => (net >= 0 ? "+" : "−") + Math.abs(net).toFixed(decimals);
