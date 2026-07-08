// Renders an in-game unit/asset SVG (from /icons) as a CSS mask tinted by the
// current text color — same technique the game uses, so a single white source
// icon works in any color/theme. `name` is a slug like "dome", "silo", "radar".
export default function GameIcon({name, size = 20, className, style}) {
    return (
        <span
            aria-hidden
            className={className}
            style={{
                display: "inline-block",
                width: size,
                height: size,
                backgroundColor: "currentColor",
                WebkitMaskImage: `url(/icons/${name}.svg)`,
                maskImage: `url(/icons/${name}.svg)`,
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                ...style,
            }}
        />
    );
}
