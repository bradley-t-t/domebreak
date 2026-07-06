import {useEffect, useRef, useState} from "react";
import {TECHS, unitLabel} from "../../game/data/constants.js";

// Turn one engine event into a headline, or null to ignore it. Kept high-signal:
// nukes, kills, construction, declarations, ceasefires, breakthroughs, and
// missiles inbound on the player — the world-scale news, not every projectile.
// tone drives the colour accent: danger / alert / good / info.
export function headline(e, world, mySlot) {
    const nn = (slot) => world.nations.find((n) => n.slot === slot)?.name || `Nation ${slot}`;
    switch (e.type) {
        case "destroy": {
            if (e.kind === "city") {
                const c = world.cities.find((x) => x.id === e.cityId);
                const name = c?.name || "A city";
                const mine = c && c.slot === mySlot;
                return {tone: "danger", text: mine ? `${name} lost to a nuclear strike` : `${name} destroyed in a nuclear strike`};
            }
            return {tone: "alert", text: `${nn(e.slot)} destroys a hostile unit`};
        }
        case "built":
            if (e.kind !== "unit") return null; // ammo stockpiling is too frequent to headline
            return {tone: e.slot === mySlot ? "good" : "info", text: `${nn(e.slot)} deploys a ${unitLabel(e.unit)}`};
        case "war":
            return {tone: "danger", text: `${nn(e.a)} declares war on ${nn(e.b)}`};
        case "peace":
            return {tone: "good", text: `${nn(e.a)} and ${nn(e.b)} agree to a ceasefire`};
        case "research": {
            const name = TECHS[e.techId]?.name;
            return {tone: "info", text: name ? `${nn(e.slot)} completes ${name}` : `${nn(e.slot)} achieves a breakthrough`};
        }
        case "launch":
            if (e.tgtSlot === mySlot && (!e.seen || e.seen.includes(mySlot)))
                return {tone: "danger", text: `Inbound — ${nn(e.slot)} missile tracking your territory`};
            return null;
        default:
            return null;
    }
}

const CAP = 40; // rolling headlines retained (the sim only keeps the last ~60 events)

// A scrolling news strip that extends the top bar. It accumulates its own
// history because the engine trims world.events to a short window — each tick we
// scan for events we have not seen and prepend their headlines (newest first).
// The marquee duplicates its content for a seamless loop; prefers-reduced-motion
// stops the scroll (handled in CSS).
export default function NewsTicker({world, mySlot}) {
    const seen = useRef(new Set());
    const [items, setItems] = useState([]);

    useEffect(() => {
        const fresh = [];
        for (const e of world.events) {
            if (seen.current.has(e.id)) continue;
            seen.current.add(e.id);
            const h = headline(e, world, mySlot);
            if (h) fresh.push({id: e.id, ...h});
        }
        if (fresh.length) setItems((list) => [...fresh.reverse(), ...list].slice(0, CAP));
        // Keep the seen-set from growing without bound as events roll off.
        if (seen.current.size > 400) seen.current = new Set(world.events.map((e) => e.id));
    }, [world.time]); // eslint-disable-line react-hooks/exhaustive-deps

    const hasNews = items.length > 0;
    // Slower for short feeds, faster for long ones, so scroll speed stays roughly
    // constant regardless of how many headlines are queued.
    const dur = Math.max(24, items.length * 5);

    return (
        <div className="gd-ticker" aria-label="News feed" aria-live="polite">
            <span className="gd-ticker-tag">Live Wire</span>
            <div className="gd-ticker-window">
                {hasNews ? (
                    <div className="gd-ticker-track" style={{animationDuration: `${dur}s`}}>
                        {[0, 1].map((copy) => (
                            <div className="gd-ticker-run" key={copy} aria-hidden={copy === 1}>
                                {items.map((it, i) => (
                                    <span className={`gd-ticker-item ${it.tone}`} key={`${copy}-${it.id}-${i}`}>
                                        <span className="gd-ticker-dot"/>{it.text}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <span className="gd-ticker-idle">Monitoring global activity…</span>
                )}
            </div>
        </div>
    );
}
