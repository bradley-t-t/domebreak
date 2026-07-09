import {useEffect, useRef, useState} from "react";
import {DIPLOMACY} from "../../game/data/constants.js";
import {formatGrace} from "../../game/sim/gameRules.js";
import {cn} from "../lib/cn.js";

const POPUP_MS = 6000;

// Two-in-one indicator for the opening non-aggression window:
//   1. While `w.time < grace`, a compact countdown pill anchored under the HUD
//      shows the remaining seconds (m:ss / 1h) so the commander sees exactly how
//      long they have to build in peace.
//   2. The instant grace lapses, a one-shot toast slides in ("Grace period
//      ended — the world may declare war") and fades on its own.
// A zero-length grace is a no-op — nothing to time, nothing to announce.
export default function GraceIndicator({world}) {
    const grace = world?.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec;
    const time = world?.time ?? 0;
    const active = grace > 0 && time < grace;
    const remaining = Math.max(0, Math.ceil(grace - time));

    // Fire the end-of-grace toast exactly once per world. Trip when the flag
    // transitions from active→inactive; ignore worlds that were never active
    // (grace of zero, or a save loaded past the window).
    const [showEnd, setShowEnd] = useState(false);
    const wasActive = useRef(active);
    const firedRef = useRef(false);
    useEffect(() => {
        if (active) {
            wasActive.current = true;
            return;
        }
        if (!wasActive.current || firedRef.current || grace <= 0) return;
        firedRef.current = true;
        setShowEnd(true);
        const t = setTimeout(() => setShowEnd(false), POPUP_MS);
        return () => clearTimeout(t);
    }, [active, grace]);

    if (!active && !showEnd) return null;
    return (
        <>
            {active && (
                <div
                    role="status"
                    aria-live="polite"
                    className="absolute top-[92px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-2 py-1.5 px-3 rounded-sm border border-gold-line bg-[rgba(244,192,42,0.12)] text-gold pointer-events-none backdrop-blur-[8px] shadow-sm motion-safe:animate-[dbPop_200ms_var(--ease-out)]">
                    <span className="db-rail-dot w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_7px_var(--gold-line)] animate-[dbBlink_2.4s_var(--ease-in-out)_infinite] motion-reduce:animate-none"/>
                    <span className="font-display uppercase tracking-[2px] text-[10px] font-semibold">Opening Grace</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums [text-shadow:var(--glow-gold)]">{formatGrace(remaining)}</span>
                </div>
            )}
            {showEnd && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className={cn(
                        "absolute top-[92px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-2 py-2 px-4 rounded-sm border border-danger bg-[rgba(224,87,79,0.14)] text-[#ffd7dd] pointer-events-none backdrop-blur-[8px] shadow-sm",
                        "motion-safe:animate-[dbPop_220ms_var(--ease-out)]"
                    )}>
                    <span className="font-display uppercase tracking-[2px] text-[10px] font-semibold text-danger">Grace Ended</span>
                    <span className="text-[12.5px]">The world may declare war on you.</span>
                </div>
            )}
        </>
    );
}
