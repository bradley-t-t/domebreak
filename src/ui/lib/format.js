// Shared display formatters for HUD/console/panel readouts. Keep these pure —
// they render engine numbers, never compute gameplay values.

// Compact population: 1.34B / 82M / 640K, plain integer below a thousand.
export const fmtPop = (p) => (p >= 1e9 ? (p / 1e9).toFixed(2) + "B" : p >= 1e6 ? (p / 1e6).toFixed(0) + "M" : p >= 1e3 ? (p / 1e3).toFixed(0) + "K" : "" + Math.round(p || 0));

// Signed net-economy figure ("+12" / "−3.5") — real minus sign, matching the HUD type.
export const fmtNet = (net, decimals = 0) => (net >= 0 ? "+" : "−") + Math.abs(net).toFixed(decimals);

// Engagement-range readout: "1,250 km", rounding and locale thousands.
export const fmtKm = (v) => `${Math.round(v).toLocaleString()} km`;

// Trillion-dollar scalar as "$1.34T" (or "$1.3T" at decimals=1). Null-safe so
// callers drop the `?? 0` dance; unprefixed variant available via includeSign
// = false if a caller wants only the tail.
export const fmtGdp = (t, decimals = 2, includeSign = true) => `${includeSign ? "$" : ""}${((t ?? 0)).toFixed(decimals)}T`;

// Round a 0..1 fraction to an integer percent. Plain number by default (for
// widths / aria); "NN%" string when opts.suffix is true.
export const fmtPct = (frac, opts = {}) => {
    const n = Math.round((frac || 0) * 100);
    return opts.suffix ? `${n}%` : n;
};

// Integer percent share of part / total, safe when total is 0.
export const shareOfPct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// Render an ISO timestamp as "Month Year" for account-since strips; null on
// missing or invalid input.
export const fmtMonthYear = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {month: "long", year: "numeric"});
};

// Integer win-rate percent from a raw stats row, safe against nulls and
// zero-match rosters.
export const winRatePct = (stats) => {
    const total = stats?.total_matches ?? 0;
    return total > 0 ? Math.round(((stats?.wins ?? 0) / total) * 100) : 0;
};

// Total playtime as a 1-decimal hour string ("12.4"); null when stats absent.
export const fmtPlaytimeHours = (stats) => (stats ? (stats.total_playtime_s / 3600).toFixed(1) : null);
