// "Target eliminated" reticle — the confirm-kill signifier that fires the moment
// a strike DESTROYS a unit (hp to 0), not merely dents it. It rides on top of the
// destroy fireball: four crimson corner brackets snap inward onto the point, a
// crosshair ring pulses out, and a red-white X flashes across the wreck. The hue
// is deliberately NOT fire-orange so a KILL reads apart from a survivable HIT at a
// glance. Pure transform/opacity so a whole salvo of kills can play without jank;
// lifetime stays under the 850ms unmount timeout the explosion pipeline enforces.

// Four corner brackets, each flying in from its own diagonal to seat on the target.
// --ox/--oy is the start offset (px, outward); one shared keyframe reads them.
const BRACKETS = [
    {cls: "tl", ox: -7, oy: -7},
    {cls: "tr", ox: 7, oy: -7},
    {cls: "bl", ox: -7, oy: 7},
    {cls: "br", ox: 7, oy: 7},
];

export default function KillMark() {
    return (
        <div className="db-kill">
            <span className="db-kill-flash"/>
            <span className="db-kill-ring"/>
            {BRACKETS.map((b) => (
                <i key={b.cls} className={`db-kill-br ${b.cls}`}
                   style={{"--ox": `${b.ox}px`, "--oy": `${b.oy}px`}}/>
            ))}
            <span className="db-kill-x a"/>
            <span className="db-kill-x b"/>
        </div>
    );
}
