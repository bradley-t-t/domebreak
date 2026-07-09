import {useRef} from "react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import WaitlistForm from "./WaitlistForm.jsx";
import Reveal from "./Reveal.jsx";
import {Eyebrow} from "./ui.jsx";

const ctaBg = "/shots/population-heat.jpg";

// Closing call to action — full-bleed console still behind a heavy scrim, the
// waitlist front and center.
export default function CtaBand() {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const {scrollYProgress} = useScroll({target: ref, offset: ["start end", "end start"]});
    const bgY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-8%", "8%"]);

    return (
        <section id="waitlist" ref={ref} className="relative scroll-mt-16 overflow-hidden border-y border-line">
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
                        <Eyebrow className="justify-center">Early access</Eyebrow>
                        <h2 className="mt-6 font-display text-[clamp(2.2rem,6vw,4.5rem)] font-bold uppercase leading-[1.02] text-text">
                            Get in early
                        </h2>
                        <p className="mx-auto mt-5 max-w-lg text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-dim">
                            Join the waitlist for early access. We'll send one email the day it's
                            playable — nothing else.
                        </p>
                    </Reveal>

                    <Reveal delay={0.15}>
                        <div className="mt-10 flex justify-center">
                            <WaitlistForm source="cta" layout="stacked" cta="Request Access"/>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
