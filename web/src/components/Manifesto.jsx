import Reveal from "./Reveal.jsx";
import {Eyebrow} from "./ui.jsx";

// Editorial thesis statement — Anduril-style big claim, revealed line by line.
const LINES = [
    ["The map is", " alive."],
    ["Every capital,", " every silo,"],
    ["every launch", " is real geography."],
];

export default function Manifesto() {
    return (
        <section className="relative mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-36">
            <div className="mx-auto max-w-4xl text-center">
                <Reveal>
                    <Eyebrow className="justify-center">Doctrine</Eyebrow>
                </Reveal>
                <div className="mt-8">
                    {LINES.map((line, i) => (
                        <Reveal key={i} delay={0.1 * i}>
                            <p className="font-display text-[clamp(1.9rem,6vw,4.2rem)] font-bold uppercase leading-[1.05] tracking-[0.005em]">
                                <span className="text-text">{line[0]}</span>
                                <span className="text-faint">{line[1]}</span>
                            </p>
                        </Reveal>
                    ))}
                </div>
                <Reveal delay={0.3}>
                    <p className="mx-auto mt-10 max-w-2xl text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-dim">
                        You run a nation in real time — its economy, its defenses, its arsenal —
                        while rival powers do the same. There is no script. There is only the world,
                        the clock, and the dome you can hold.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
