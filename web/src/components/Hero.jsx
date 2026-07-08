import {useRef} from "react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import {ChevronDown} from "lucide-react";
import WaitlistForm from "./WaitlistForm.jsx";
import HeroGlobe from "./HeroGlobe.jsx";
import {Eyebrow, Wordmark} from "./ui.jsx";

export default function Hero() {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const {scrollYProgress} = useScroll({target: ref, offset: ["start start", "end start"]});
    const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "-14%"]);
    const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

    return (
        <section ref={ref} className="relative min-h-[100svh] w-full overflow-hidden">
            {/* Live in-game globe (real engine) over a static poster. */}
            <HeroGlobe/>

            {/* Instrument overlays. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0 db-grid"/>
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0 db-vignette"/>
            {/* Left scrim keeps the command rail legible over the globe on narrow screens. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-0 w-full bg-[linear-gradient(90deg,var(--bg)_0%,rgba(8,9,11,0.55)_34%,rgba(8,9,11,0)_62%)] md:w-[68%]"/>

            {/* Command rail. */}
            <motion.div
                style={reduce ? undefined : {y: contentY, opacity: contentOpacity}}
                className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1400px] flex-col justify-center px-5 pt-24 pb-16 sm:px-8"
            >
                <div className="relative max-w-2xl db-tick pl-1">
                    <motion.div
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(14px)"}}
                        animate={{opacity: 1, transform: "translateY(0px)"}}
                        transition={{duration: 0.7, ease: [0.23, 1, 0.32, 1]}}
                    >
                        <Eyebrow>System Online — Pre-Registration Open</Eyebrow>

                        <h1 className="mt-6">
                            <Wordmark glow className="block text-[clamp(3rem,11vw,7.5rem)]"/>
                        </h1>
                        <p className="mt-4 font-display text-[13px] font-semibold uppercase tracking-[0.34em] text-dim sm:text-[15px]">
                            Global Missile Command
                        </p>
                    </motion.div>

                    <motion.p
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(14px)"}}
                        animate={{opacity: 1, transform: "translateY(0px)"}}
                        transition={{duration: 0.7, delay: 0.12, ease: [0.23, 1, 0.32, 1]}}
                        className="mt-8 max-w-xl text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed text-dim"
                    >
                        A real-time strategy game of missile defense and offense on a
                        <span className="text-text"> living world map</span>. Every nation is a
                        <span className="text-text"> live AI</span>. One dome stands between
                        order and annihilation.
                    </motion.p>

                    <motion.div
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(14px)"}}
                        animate={{opacity: 1, transform: "translateY(0px)"}}
                        transition={{duration: 0.7, delay: 0.24, ease: [0.23, 1, 0.32, 1]}}
                        className="mt-9"
                    >
                        <WaitlistForm source="hero" cta="Request Access"/>
                        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                            Desktop · macOS + Windows
                        </p>
                    </motion.div>
                </div>
            </motion.div>

            {/* Scroll cue. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
                <motion.div
                    aria-hidden
                    animate={reduce ? undefined : {transform: ["translateY(0px)", "translateY(6px)", "translateY(0px)"]}}
                    transition={{duration: 2.4, repeat: Infinity, ease: "easeInOut"}}
                    className="flex flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-[0.28em] text-faint"
                >
                    <span>Scroll</span>
                    <ChevronDown size={14}/>
                </motion.div>
            </div>
        </section>
    );
}
