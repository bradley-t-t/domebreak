import {Check} from "lucide-react";
import Reveal from "./Reveal.jsx";
import BetaApplyCard from "./BetaApplyCard.jsx";
import GameIcon from "./GameIcon.jsx";
import {Eyebrow} from "./Primitives.jsx";

const PERKS = [
    "Play the closed beta before the Steam launch",
    "Direct line to shape balance, units, and UI",
    "Founding-tester credit when the game ships",
];

// Featured closed-beta band on the landing page. Left rail pitches the beta;
// right card holds the application form. Anchored at #beta so the nav, hero, and
// footer can jump to it.
export default function ClosedBeta() {
    return (
        <section id="beta" className="relative scroll-mt-16 overflow-hidden border-y border-line bg-bg">
            <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>
            <div aria-hidden className="pointer-events-none absolute inset-0 db-vignette"/>

            <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
                {/* Pitch */}
                <div className="max-w-xl">
                    <Reveal>
                        <Eyebrow>Closed beta · Applications open</Eyebrow>
                        <h2 className="mt-6 font-display text-[clamp(2rem,5vw,3.4rem)] font-bold uppercase leading-[1.03] text-text">
                            Get into the <span className="text-dim">closed beta</span>
                        </h2>
                        <p className="mt-5 max-w-lg text-[clamp(1rem,1.35vw,1.12rem)] leading-relaxed text-dim">
                            Before DomeBreak hits Steam, a small group of testers gets in early to
                            break it, stress the servers, and steer the build. Apply below — we read
                            every application and invite in waves.
                        </p>
                    </Reveal>

                    <Reveal delay={0.12}>
                        <ul className="mt-8 flex flex-col gap-3 border-t border-hair pt-6">
                            {PERKS.map((p) => (
                                <li key={p} className="flex items-start gap-3 text-[14px] leading-relaxed text-dim">
                                    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-gold-line bg-gold-soft text-gold">
                                        <Check size={11} strokeWidth={3}/>
                                    </span>
                                    {p}
                                </li>
                            ))}
                        </ul>
                    </Reveal>

                    <Reveal delay={0.18}>
                        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                            <span className="flex items-center gap-2">
                                <GameIcon name="dome" size={15} className="text-dim"/>
                                Desktop · macOS + Windows
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="h-[6px] w-[6px] rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
                                Limited slots
                            </span>
                        </div>
                    </Reveal>
                </div>

                {/* Application card */}
                <Reveal delay={0.1}>
                    <BetaApplyCard source="beta"/>
                </Reveal>
            </div>
        </section>
    );
}
