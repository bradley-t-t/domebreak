import Reveal from "./Reveal.jsx";
import CountUp from "./CountUp.jsx";

const MARQUEE = [
    "LEADERSHIP", "STABILITY", "EARLY WARNING", "INTERCEPT", "THAAD", "SILO", "RADAR",
    "DEFCON", "PAYLOAD", "TRAJECTORY", "DIPLOMACY", "GDP", "POPULATION", "AIRSTRIP",
];

const STATS = [
    {value: 195, format: (n) => `${Math.round(n)}`, label: "Nations", sub: "Every one on the real map"},
    {value: 8, format: (n) => `${Math.round(n)}`, label: "Powers per match", sub: "No two matches alike"},
    {value: 100, format: (n) => `${Math.round(n)}%`, label: "Real-time", sub: "Pause · 0.5× to 10×"},
    {value: 1, format: (n) => `${Math.round(n)}`, label: "Dome to hold", sub: "The line you defend"},
];

export default function StatBand() {
    return (
        <section className="relative border-y border-line bg-bg-2/60">
            {/* Marquee ribbon */}
            <div className="relative overflow-hidden border-b border-hair py-3">
                <div className="db-marquee flex w-max whitespace-nowrap will-change-transform">
                    {[0, 1].map((k) => (
                        <div key={k} className="flex shrink-0" aria-hidden={k === 1}>
                            {MARQUEE.map((t) => (
                                <span key={t + k} className="flex items-center">
                                    <span className="px-6 font-mono text-[11px] uppercase tracking-[0.28em] text-faint">{t}</span>
                                    <span className="h-[3px] w-[3px] rounded-full bg-line"/>
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Counters */}
            <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-px bg-line lg:grid-cols-4">
                {STATS.map((s, i) => (
                    <Reveal key={s.label} delay={0.08 * i} className="bg-bg px-6 py-10 sm:px-8">
                        <div className="font-mono text-[clamp(2rem,4.5vw,3.2rem)] font-semibold leading-none text-text tabular-nums">
                            <CountUp value={s.value} format={s.format}/>
                        </div>
                        <div className="mt-3 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-faint">
                            {s.label}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-dim">{s.sub}</div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}
