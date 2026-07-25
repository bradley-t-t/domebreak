import {cn} from "../lib/cn.js";

// DomeBreak's bespoke icon set. Every glyph is hand-drawn on a 24-unit grid in
// the HUD's line language — 1.7px hairline strokes, round joins, squared intent
// — so the interface carries a single authored hand instead of a stock icon
// font. Icons inherit color via `currentColor`; a handful are solid marks
// (star, bolt, radiation, points) and set their own fill.
//
// This is the UI-chrome set (categories, layers, tabs, controls). Fielded units
// keep their filled silhouettes under /public/icons via <UnitIcon>.

const S = {fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round"};
const F = {fill: "currentColor", stroke: "none"};

const ICONS = {
    // Production categories
    // All systems: a 2x2 module grid.
    systems: (
        <>
            <rect x="4" y="4" width="6.5" height="6.5" rx="1"/>
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/>
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/>
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>
        </>
    ),
    // Support: a sensor mast throwing three widening returns.
    support: (
        <>
            <path d="M12 21V11"/>
            <circle cx="12" cy="9" r="1.4" {...F}/>
            <path d="M8.2 12.5a5.4 5.4 0 0 1 7.6 0"/>
            <path d="M5.6 15.1a9 9 0 0 1 12.8 0"/>
            <path d="M20 21H4"/>
        </>
    ),
    // Air defense: a shield-dome with an interceptor rising through it.
    "air-defense": (
        <>
            <path d="M4 16.5a8 8 0 0 1 16 0"/>
            <path d="M3 16.5h18"/>
            <path d="M12 15V7"/>
            <path d="M9.6 9.6 12 6.6l2.4 3"/>
        </>
    ),
    // Strike: a rocket climbing off its flame — the offensive platforms.
    strike: (
        <>
            <path d="M12 3 15 8v5.5H9V8Z"/>
            <circle cx="12" cy="8" r="1.1" {...F}/>
            <path d="M9 10.8 6.4 14.4H9"/>
            <path d="M15 10.8l2.6 3.6H15"/>
            <path d="M10.4 13.5c0 2 1.6 3.2 1.6 5 0-1.8 1.6-3 1.6-5"/>
        </>
    ),
    // Army: an armored hull, turret and gun over road wheels.
    army: (
        <>
            <path d="M3 15.5h17l-1.5 3H4.5Z"/>
            <rect x="8" y="9.5" width="6" height="4" rx="0.6"/>
            <path d="M14 11h7"/>
            <circle cx="7" cy="19.6" r="1.1" {...F}/>
            <circle cx="12" cy="19.6" r="1.1" {...F}/>
            <circle cx="17" cy="19.6" r="1.1" {...F}/>
        </>
    ),
    // Naval: a warship hull, bridge and mast on the waterline.
    naval: (
        <>
            <path d="M3.5 14.5h16l-2 4H5.5Z"/>
            <path d="M9 14.5v-4h5l1 4"/>
            <path d="M11.5 10.5V6.5"/>
            <path d="M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/>
        </>
    ),
    // Space: an orbital body tracking its ring.
    space: (
        <>
            <ellipse cx="12" cy="12" rx="9" ry="4.4" transform="rotate(-28 12 12)"/>
            <circle cx="12" cy="12" r="2.4" {...F}/>
            <circle cx="18.4" cy="7.6" r="1.2" {...F}/>
        </>
    ),
    // Industry: a saw-tooth works with a smokestack.
    industry: (
        <>
            <path d="M3 20v-7l4 2.6V13l4 2.6V13l4 2.6"/>
            <path d="M3 20h18"/>
            <path d="M15 20v-9h3v9"/>
            <path d="M18 11V6h2v5"/>
        </>
    ),
    // Munitions: a banded warhead shell.
    munitions: (
        <>
            <path d="M12 2.8c1.9 1.7 2.9 3.7 2.9 6V17H9.1V8.8c0-2.3 1-4.3 2.9-6Z"/>
            <path d="M9.1 11.5h5.8M9.1 14h5.8"/>
            <path d="M10.4 17v2.4M13.6 17v2.4"/>
        </>
    ),

    // Map layers
    // Countries: a wireframe globe.
    countries: (
        <>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M3.5 12h17"/>
            <ellipse cx="12" cy="12" rx="4" ry="8.5"/>
        </>
    ),
    // Diplomacy: a balance holding two pans level.
    "diplomacy-scale": (
        <>
            <path d="M12 4v15"/>
            <path d="M6 19h12"/>
            <path d="M5 8h14"/>
            <path d="m5 8-2.5 5a2.6 2.6 0 0 0 5 0Z"/>
            <path d="m19 8-2.5 5a2.6 2.6 0 0 0 5 0Z"/>
        </>
    ),
    // State borders: a territory outline split by a surveyed seam.
    borders: (
        <>
            <path d="M4 5.5h16v13H4Z"/>
            <path d="M8.5 5.5 10 10l-2.5 2.5L11 15l-1.5 3.5" strokeDasharray="2.4 2.2"/>
        </>
    ),
    // Defense range: nested coverage domes over a battery.
    defense: (
        <>
            <circle cx="12" cy="17" r="1.4" {...F}/>
            <path d="M7 17a5 5 0 0 1 10 0"/>
            <path d="M3.5 17a8.5 8.5 0 0 1 17 0"/>
        </>
    ),
    // Radar: a swept dish with a return blip.
    radar: (
        <>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M12 12V4a8 8 0 0 1 7 4.3Z" {...F} opacity="0.9"/>
            <circle cx="12" cy="12" r="1.3" {...F}/>
            <circle cx="16.5" cy="15.5" r="1" {...F}/>
        </>
    ),
    // Population heat: contour rings blooming from a hot core.
    pop: (
        <>
            <circle cx="12" cy="12" r="1.6" {...F}/>
            <path d="M8.5 12a3.5 3.5 0 0 1 7 0 3.5 3.5 0 0 1-7 0Z"/>
            <path d="M5.5 12a6.5 6.5 0 0 1 13 0 6.5 6.5 0 0 1-13 0Z" opacity="0.75"/>
        </>
    ),
    // World cities: a low skyline of lit blocks.
    cities: (
        <>
            <path d="M3 20h18"/>
            <path d="M5 20v-6h4v6"/>
            <path d="M9 20v-9h5v9"/>
            <path d="M14 20V8h5v12"/>
        </>
    ),

    // Command tabs
    // Production: crated arsenal stock.
    production: (
        <>
            <path d="M4 9.5 12 5l8 4.5v5L12 19l-8-4.5Z"/>
            <path d="M4 9.5 12 14l8-4.5"/>
            <path d="M12 14v5"/>
        </>
    ),
    // Battle plan: a strike arc curving into a target.
    "battle-plan": (
        <>
            <circle cx="16.5" cy="15.5" r="3.2"/>
            <path d="M16.5 15.5h.01" {...F}/>
            <path d="M3.5 18C6 9 10 5 17.5 5"/>
            <path d="M17.5 5 14 4.6M17.5 5l-.6 3.4"/>
        </>
    ),
    // Diplomacy: a treaty pennant on its staff.
    diplomacy: (
        <>
            <path d="M7 4v16"/>
            <path d="M7 5h11l-3 3.5L18 12H7"/>
        </>
    ),

    // Controls / chrome
    close: (
        <>
            <path d="M6 6l12 12M18 6L6 18"/>
        </>
    ),
    check: (
        <>
            <path d="M4.5 12.5 10 18 20 6"/>
        </>
    ),
    "chevron-down": (
        <>
            <path d="M6 9.5 12 15.5 18 9.5"/>
        </>
    ),
    "chevron-up": (
        <>
            <path d="M6 14.5 12 8.5 18 14.5"/>
        </>
    ),
    menu: (
        <>
            <path d="M4 7h16M4 12h16M4 17h16"/>
        </>
    ),
    help: (
        <>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M9.4 9.6a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 4"/>
            <circle cx="12" cy="17.4" r="1" {...F}/>
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M3.5 12h17"/>
            <ellipse cx="12" cy="12" rx="4" ry="8.5"/>
        </>
    ),
    grid: (
        <>
            <rect x="4" y="4" width="16" height="16" rx="1.5"/>
            <path d="M4 9.5h16M4 15h16M9.5 4v16M15 4v16"/>
        </>
    ),
    lock: (
        <>
            <rect x="5" y="10.5" width="14" height="9.5" rx="1.6"/>
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>
            <circle cx="12" cy="15" r="1.2" {...F}/>
        </>
    ),
    target: (
        <>
            <circle cx="12" cy="12" r="7.5"/>
            <circle cx="12" cy="12" r="3.2"/>
            <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>
        </>
    ),
    // Leadership: a capitol — pediment on a colonnade.
    leadership: (
        <>
            <path d="M12 3.5 20 8H4Z"/>
            <path d="M4 8v.5h16V8"/>
            <path d="M6.5 10v7M10 10v7M14 10v7M17.5 10v7"/>
            <path d="M4 19.5h16"/>
        </>
    ),
    eye: (
        <>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>
            <circle cx="12" cy="12" r="2.6"/>
        </>
    ),
    "eye-off": (
        <>
            <path d="M4 6.5c2 2.4 4.7 4 8 4s6-1.6 8-4"/>
            <path d="m5 10-1.5 2.2M12 11.5V14M19 10l1.5 2.2M8 10.8 6.8 13.4M16 10.8l1.2 2.6"/>
        </>
    ),
    reset: (
        <>
            <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/>
            <path d="M3.5 5v3.6h3.6"/>
        </>
    ),
    sliders: (
        <>
            <path d="M4 7h11M18.5 7H20M4 12h3M10.5 12H20M4 17h9M16.5 17H20"/>
            <circle cx="16.5" cy="7" r="1.7"/>
            <circle cx="8.5" cy="12" r="1.7"/>
            <circle cx="14.5" cy="17" r="1.7"/>
        </>
    ),
    grip: (
        <>
            <circle cx="9" cy="6" r="1.1" {...F}/>
            <circle cx="15" cy="6" r="1.1" {...F}/>
            <circle cx="9" cy="12" r="1.1" {...F}/>
            <circle cx="15" cy="12" r="1.1" {...F}/>
            <circle cx="9" cy="18" r="1.1" {...F}/>
            <circle cx="15" cy="18" r="1.1" {...F}/>
        </>
    ),
    maximize: (
        <>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>
        </>
    ),
    contrast: (
        <>
            <circle cx="12" cy="12" r="8.5"/>
            <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" {...F}/>
        </>
    ),
    // Peace: two forearms clasped mid-shake.
    handshake: (
        <>
            <path d="M12 13.5 8.5 10l-2.7 2.4a1.6 1.6 0 0 0 2.2 2.3l1-.9"/>
            <path d="m12 10.5 2 1.9a1.5 1.5 0 0 0 2.1-2.2l-3-2.7-2.6.7-2.3-.8"/>
            <path d="M2.5 8 6 6.3l3 1M21.5 11.5 18 13"/>
            <path d="M2.5 8 5 13.5M21.5 11.5 19 6.3l-2 .8"/>
        </>
    ),
    // War: crossed blades over their hilts.
    swords: (
        <>
            <path d="M5 4.2 15 14.2"/>
            <path d="M19 4.2 9 14.2"/>
            <path d="M4 6.5h2.6M17.4 6.5H20"/>
            <path d="M15 14.2 18.4 17.6 16.9 19.1 13.5 15.7"/>
            <path d="M9 14.2 5.6 17.6 7.1 19.1 10.5 15.7"/>
        </>
    ),
    message: (
        <>
            <path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4Z"/>
            <path d="M8 9h8M8 12.5h5"/>
        </>
    ),
    pencil: (
        <>
            <path d="M14.5 5.5 18.5 9.5"/>
            <path d="M4.5 19.5 5.5 15 15 5.5a1.9 1.9 0 0 1 2.7 0l.8.8a1.9 1.9 0 0 1 0 2.7L9 18.5Z"/>
        </>
    ),
    plus: (
        <>
            <path d="M12 5v14M5 12h14"/>
        </>
    ),
    // Build time — a mustered stopwatch.
    timer: (
        <>
            <circle cx="12" cy="13.5" r="7"/>
            <path d="M12 13.5V9.5"/>
            <path d="M9.5 3.5h5M12 3.5v3"/>
            <path d="m18 8 1.5-1.5"/>
        </>
    ),
    // Shift-to-multiply hint.
    shift: (
        <>
            <path d="M12 4 5 11h3.5v6h7v-6H19Z"/>
        </>
    ),
    // Fallout / contamination trefoil.
    radiation: (
        <>
            <circle cx="12" cy="12" r="1.8" {...F}/>
            <path d="M12 3.5a4 4 0 0 1 3.5 6L12 8Z" {...F}/>
            <path d="M20.5 16.5a4 4 0 0 1-6.9.3L18 14.3Z" {...F}/>
            <path d="M3.5 16.5a4 4 0 0 0 6.9.3L6 14.3Z" {...F}/>
        </>
    ),
    // Rising-population caret.
    "trend-up": (
        <>
            <path d="M12 6 19 16H5Z" {...F}/>
        </>
    ),
    // Signature / capital star.
    star: (
        <>
            <path d="M12 3.5 14.6 9l6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.7 9.4 9Z" {...F}/>
        </>
    ),
    // Execute strike.
    bolt: (
        <>
            <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12Z" {...F}/>
        </>
    ),
    // Transport controls.
    play: (
        <>
            <path d="M7 4.5 19 12 7 19.5Z" {...F}/>
        </>
    ),
    pause: (
        <>
            <rect x="6.5" y="4.5" width="3.4" height="15" rx="1" {...F}/>
            <rect x="14.1" y="4.5" width="3.4" height="15" rx="1" {...F}/>
        </>
    ),
    stop: (
        <>
            <rect x="5.5" y="5.5" width="13" height="13" rx="1.6" {...F}/>
        </>
    ),
    // Command points — a faceted command chit (replaces the ◆ currency glyph).
    points: (
        <>
            <path d="M12 3 20.5 12 12 21 3.5 12Z"/>
            <path d="M6.5 12h11" opacity="0.85"/>
            <path d="M12 3v18" opacity="0.4"/>
        </>
    ),
};

// One inline SVG per name. `size` sets both axes; color follows currentColor so
// callers tint with text-* utilities exactly like the rest of the HUD.
export default function Icon({name, size = 16, className = "", strokeWidth, title, style}) {
    const glyph = ICONS[name];
    if (!glyph) return null;
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} style={style}
             className={cn("inline-block flex-none align-middle", className)}
             {...S} strokeWidth={strokeWidth ?? S.strokeWidth}
             role={title ? "img" : undefined} aria-hidden={title ? undefined : "true"} aria-label={title}>
            {glyph}
        </svg>
    );
}
