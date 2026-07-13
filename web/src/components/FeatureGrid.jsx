import Reveal from "./Reveal.jsx";
import {Eyebrow} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";

// Icons are the game's own unit/asset art (from /icons), tinted to match.
const FEATURES = [
    {icon: "reconsat", title: "The world map", body: "Real borders, real cities, real population, on a 3D globe built from actual geography."},
    {icon: "spacehq", title: "Rival powers", body: "Up to eleven rival powers each run their own economy, defenses, and doctrine, and react to what you do. No two matches play out the same."},
    {icon: "dome", title: "Missile defense", body: "Blanket your territory in radar and early warning. Layer interceptors, THAAD, and area defense to hold the dome."},
    {icon: "silo", title: "Missile offense", body: "Plan an attack — pick launchers, choose targets, route the trajectory, and let it fly."},
    {icon: "factory", title: "A nation to run", body: "Balance GDP, industry, and stability. Every silo and interceptor is paid for out of a real budget."},
    {icon: "spacehq", title: "Desktop-first", body: "A native app for macOS and Windows. Your saves stay on your machine."},
];

export default function FeatureGrid() {
    return (
        <section id="features" className="mx-auto max-w-[1400px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
                <Eyebrow>Capabilities</Eyebrow>
                <h2 className="mt-5 max-w-3xl font-display text-[clamp(1.8rem,4vw,3rem)] font-bold uppercase leading-[1.03] text-text">
                    One console. Total command.
                </h2>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map((f, i) => (
                    <Reveal key={f.title} delay={0.05 * i} className="group relative bg-bg">
                        <div className="relative h-full db-tick p-7 transition-colors duration-200 hover:bg-bg-2 sm:p-8">
                            <span className="flex h-11 w-11 items-center justify-center rounded border border-line bg-gold-soft text-gold transition-colors duration-200 group-hover:border-gold-line">
                                <GameIcon name={f.icon} size={22}/>
                            </span>
                            <h3 className="mt-5 font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-text">
                                {f.title}
                            </h3>
                            <p className="mt-3 text-[14.5px] leading-relaxed text-dim">{f.body}</p>
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}
