import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TECHS, unitLabel} from "../../game/data/constants.js";
import {nationName} from "../../game/engine.js";
import {cn} from "../lib/cn.js";

// Turn one engine event into a headline, or null to ignore it. Kept high-signal:
// nukes, kills, construction, declarations, ceasefires, breakthroughs, and
// missiles inbound on the player — the world-scale news, not every projectile.
// tone drives the colour accent: danger / alert / good / info.
export function headline(e, world, mySlot) {
    const nn = (slot) => nationName(world, slot);
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
        case "captured": {
            const where = e.state || world.cities.find((x) => x.id === e.cityId)?.name || "territory";
            const mine = e.slot === mySlot, lost = e.fromSlot === mySlot;
            if (mine) return {tone: "good", text: `Your forces occupy ${where} — ${nn(e.fromSlot)} loses the province`};
            if (lost) return {tone: "danger", text: `${where} falls — ${nn(e.slot)} occupies your territory`};
            return {tone: "alert", text: `${nn(e.slot)} occupies ${where} from ${nn(e.fromSlot)}`};
        }
        case "launch":
            if (e.tgtSlot === mySlot && (!e.seen || e.seen.includes(mySlot)))
                return {tone: "danger", text: `Inbound — ${nn(e.slot)} missile tracking your territory`};
            return null;
        case "leadership": {
            const mine = e.slot === mySlot;
            const n = e.lost || 0;
            const noun = `${n} ${n === 1 ? "leader" : "leaders"}`;
            let where;
            if (e.bunker) where = "the bunker falls — sheltered leadership lost";
            else if (e.cityId) where = `${world.cities.find((x) => x.id === e.cityId)?.name || "the capital"} — ${noun} killed`;
            else where = `an evac convoy is downed — ${noun} lost`;
            return {tone: mine ? "danger" : "alert", text: mine ? `Leadership lost: ${where}` : `${nn(e.slot)} leadership decapitated — ${noun}`};
        }
        default:
            return null;
    }
}

const CAP = 40;       // rolling headlines retained (the sim only keeps the last ~60 events)
const SPEED = 40;     // px/sec — wall-clock scroll speed, independent of game speed
const SCAN_MS = 300;  // fixed cadence to harvest new headlines, decoupled from the sim tick

// A scrolling news strip. Two things keep it smooth and speed-independent:
//
//  1. Headlines are harvested on a fixed wall-clock interval (NOT per sim tick),
//     so the update rate — and any layout cost — is identical at 1× and 5× game
//     speed. New headlines are APPENDED (they enter from the right and scroll
//     across), so adding one never shifts the currently-visible strip.
//  2. The scroll is a rAF loop advancing a continuous pixel offset in wall-clock
//     time, wrapped into (-w, 0] every frame against the live run width. It never
//     resets to the start; the duplicated second run makes the wrap seamless.
//     When old headlines are trimmed off the front, the exact width removed is
//     added back to the offset before paint, so trimming never makes it jump.
export default function NewsTicker({world, mySlot}) {
    const [items, setItems] = useState([]);
    const seen = useRef(new Set());
    const itemsRef = useRef([]);            // mirror of items, matches the committed DOM between scans
    const ctx = useRef({world, mySlot});
    // Keep the scanner's view of world/mySlot current (engine mutates world in
    // place); updated after each render, well ahead of the 300 ms scan cadence.
    useEffect(() => {
        ctx.current = {world, mySlot};
    });

    const trackRef = useRef(null);
    const runRef = useRef(null);
    const offsetRef = useRef(0);
    const trimWidthRef = useRef(0);         // front width removed this update, compensated pre-paint

    useEffect(() => {
        const scan = () => {
            const {world: w, mySlot: ms} = ctx.current;
            const fresh = [];
            for (const e of w.events) {
                if (seen.current.has(e.id)) continue;
                seen.current.add(e.id);
                const h = headline(e, w, ms);
                if (h) fresh.push({id: e.id, ...h});
            }
            if (seen.current.size > 400) seen.current = new Set(w.events.map((e) => e.id));
            if (!fresh.length) return;
            let next = [...itemsRef.current, ...fresh];
            const over = next.length - CAP;
            if (over > 0) {
                // Measure the front items about to be dropped (they're still in the
                // DOM, matching itemsRef) so the scroll can hold its visible place.
                const run = runRef.current;
                if (run && run.children.length > over) {
                    const firstLeft = run.children[0].getBoundingClientRect().left;
                    const cutLeft = run.children[over].getBoundingClientRect().left;
                    trimWidthRef.current += cutLeft - firstLeft;
                }
                next = next.slice(over);
            }
            itemsRef.current = next;
            setItems(next);
        };
        scan();
        const id = setInterval(scan, SCAN_MS);
        return () => clearInterval(id);
    }, []);

    // Trimming the front shifts remaining content left; add the removed width back
    // to the offset before paint so the visible strip stays put (no jump).
    useLayoutEffect(() => {
        if (trimWidthRef.current) {
            offsetRef.current += trimWidthRef.current;
            trimWidthRef.current = 0;
        }
    }, [items]);

    const hasNews = items.length > 0;

    useEffect(() => {
        if (!hasNews) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        let raf, last = null;
        const step = (t) => {
            const track = trackRef.current, run = runRef.current;
            if (track && run) {
                if (last == null) last = t;
                const dt = Math.min((t - last) / 1000, 0.05); // clamp long frames (tab defocus)
                last = t;
                const w = run.scrollWidth || 1;
                let off = offsetRef.current - SPEED * dt;
                // Wrap into (-w, 0] against the live width — robust to the run
                // growing (tail append) or shrinking (front trim), so it never snaps.
                off %= w;
                if (off > 0) off -= w;
                offsetRef.current = off;
                track.style.transform = `translateX(${off}px)`;
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [hasNews]);

    const toneClass = {
        info: "",
        good: "text-text",
        alert: "",
        danger: "text-[#f0a39d]",
    };
    const dotToneClass = {
        info: "bg-faint",
        good: "bg-text",
        alert: "bg-[#d79a3f]",
        danger: "bg-red shadow-[0_0_5px_rgba(224,87,79,0.8)]",
    };

    return (
        <div
            className="db-ticker z-4 flex items-stretch w-[min(720px,100%)] h-7 bg-panel-2 border border-line rounded shadow overflow-hidden pointer-events-auto motion-safe:animate-[dbDropInY_340ms_var(--ease-drawer)] max-[900px]:hidden"
            aria-label="News feed" aria-live="polite">
            <span
                className="db-ticker-tag flex items-center gap-[6px] px-[11px] text-[9.5px] tracking-[1px] uppercase text-faint bg-panel border-r border-line flex-none">Live Wire</span>
            <div className="relative flex-1 overflow-hidden flex items-center">
                {hasNews ? (
                    <div className="inline-flex flex-nowrap whitespace-nowrap will-change-transform" ref={trackRef}>
                        {[0, 1].map((copy) => (
                            <div className={cn("inline-flex flex-nowrap", copy === 1 && "motion-reduce:hidden")}
                                 key={copy} ref={copy === 0 ? runRef : null} aria-hidden={copy === 1}>
                                {items.map((it, i) => (
                                    <span
                                        className={cn("inline-flex items-center gap-2 px-[22px] text-xs text-text whitespace-nowrap", toneClass[it.tone])}
                                        key={`${copy}-${it.id}-${i}`}>
                                        <span
                                            className={cn("w-[5px] h-[5px] rounded-full bg-faint flex-none", dotToneClass[it.tone])}/>{it.text}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <span className="px-4 text-xs text-faint">Monitoring global activity…</span>
                )}
            </div>
        </div>
    );
}
