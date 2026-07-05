// Renders a single-path SVG (game-icons.net) as a CSS mask so it can be tinted
// to any color. Icons are CC BY 3.0 (Lorc, Delapouite) — see NOTICE.
export default function UnitIcon({name, color = "currentColor", size = 18, className = ""}) {
    const url = `/icons/${name}.svg`;
    return (
        <span className={`gd-icon ${className}`} aria-hidden="true"
              style={{
                  width: size,
                  height: size,
                  background: color,
                  WebkitMaskImage: `url(${url})`,
                  maskImage: `url(${url})`
              }}/>
    );
}
