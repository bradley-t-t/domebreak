import {useRef} from "react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import Reveal from "./Reveal.jsx";
import PlayCta from "./PlayCta.jsx";
import {Eyebrow} from "./Primitives.jsx";

const ctaBg = "/shots/population-heat.jpg";

// Closing call to action — full-bleed console behind a heavy scrim, the free
// play/download CTA front and center.
export default function CtaBand({onSignIn}) {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const {scrollYProgress} = useScroll({target: ref, offset: ["start end", "end start"]});
    const bgY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-8%", "8%"]);

    return (
        <section id="get-started" ref={ref} className="relative scroll-mt-16 overflow-hidden border-y border-line">
            <motion.img
                aria-hidden
                src={ctaBg}
                alt=""
                loading="lazy"
                decoding="async"
                style={reduce ? undefined : {y: bgY}}
                className="absolute inset-0 z-0 h-[116%] w-full -translate-y-[8%] object-cover opacity-[0.28]"
            />
            <div aria-hidden className="absolute inset-0 z-0 bg-[radial-gradient(120%_120%_at_50%_20%,rgba(8,9,11,0.7),rgba(8,9,11,0.94))]"/>
            <div aria-hidden className="absolute inset-0 z-0 db-grid"/>

            <div className="relative z-10 mx-auto max-w-[1400px] px-5 py-24 sm:px-8 sm:py-36">
                <div className="mx-auto max-w-2xl text-center">
                    <Reveal>
                        <Eyebrow className="justify-center">Free to play · Out now</Eyebrow>
                        <h2 className="mt-6 font-display text-[clamp(2.2rem,6vw,4.5rem)] font-bold uppercase leading-[1.02] text-text">
                            Raise your dome
                        </h2>
                        <p className="mx-auto mt-5 max-w-lg text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-dim">
                            DomeBreak is live and free. Create your account, download the game for
                            macOS or Windows, and take the fight online.
                        </p>
                    </Reveal>

                    <Reveal delay={0.15}>
                        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                            <PlayCta/>
                            <button
                                onClick={() => onSignIn?.("signup")}
                                className="db-btn font-display inline-flex items-center rounded-sm border border-line bg-transparent px-[22px] py-[14px] text-[12px] font-semibold uppercase tracking-[1.4px] text-dim transition-colors duration-150 ease-out-db hover:border-blue hover:text-text"
                            >
                                Create a free account
                            </button>
                        </div>
                    </Reveal>

                    <Reveal delay={0.22}>
                        <p className="mx-auto mt-8 max-w-xl border-t border-hair pt-8 font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                            Already have an account?{" "}
                            <button
                                onClick={() => onSignIn?.("signin")}
                                className="text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text"
                            >
                                Sign in
                            </button>
                        </p>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
