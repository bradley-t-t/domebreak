import {fmtPop} from "../lib/format.js";
import {VIT_GREEN} from "../lib/status.js";
import {cn} from "../lib/cn.js";

// Population-growth signifier: a small upward caret shown whenever a population is
// climbing — repopulation and city rebuilding made visible beside any pop readout.
// Two ways to drive it:
//   • rate + base — the change in people/game-second (populationTrendOf) over the
//     current figure; renders "+N.N%/min" when `label`, and always in the tooltip.
//   • up + title — a bare caret with a caller-supplied tooltip, for dense rows
//     where a per-item rate would be noise (e.g. a city that is rebuilding).
// Renders nothing when flat (capped/wrecked/steady) so unchanging figures stay
// uncluttered. Presentation only.
export default function PopTrend({rate, base, up, title, label = false, className}) {
    let pctMin = null;
    if (rate > 0 && base > 0) {
        pctMin = (rate * 60 / base) * 100;
        if (pctMin < 0.05) return null; // below rounding — reads as flat, so stay silent
    } else if (!up) {
        return null;
    }
    const tip = title || (pctMin != null
        ? `Population growing +${fmtPop(rate * 60)}/min (+${pctMin.toFixed(1)}%/min)`
        : "Population growing");
    return (
        <span className={cn("inline-flex items-center gap-[2px] leading-none", className)}
              style={{color: VIT_GREEN}} title={tip} aria-label={tip}>
            <span aria-hidden="true">▲</span>
            {label && pctMin != null && <span className="font-mono tabular-nums">+{pctMin.toFixed(1)}%/min</span>}
        </span>
    );
}
