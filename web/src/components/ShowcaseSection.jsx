import {useRef} from "react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import {cn} from "../lib/cn.js";
import Reveal from "./Reveal.jsx";
import {Eyebrow} from "./ui.jsx";
import {useInViewOnce} from "../lib/useInViewOnce.js";

// One feature showcase: framed in-game screenshot on one side, briefing copy on
// the other. The image wipes in (clip-path) on scroll and drifts with a light
// parallax; sides alternate down the page.
export default function ShowcaseSection({index, kicker, title, body, points = [], image, imageAlt, side = "left"}) {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const {scrollYProgress} = useScroll({target: ref, offset: ["start end", "end start"]});
    const imgY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["6%", "-6%"]);
    const [panelRef, panelIn] = useInViewOnce();

    const imageFirst = side === "left";

    return (
        <section ref={ref} className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                {/* Screenshot panel */}
                <div className={cn("order-1", imageFirst ? "lg:order-1" : "lg:order-2")}>
                    <div
                        ref={panelRef}
                        className="relative db-tick db-seam overflow-hidden rounded-lg border border-line bg-panel-solid shadow"
                        style={{
                            clipPath: reduce ? "none" : panelIn ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
                            opacity: panelIn ? 1 : reduce ? 1 : 0,
                            transition: "clip-path 0.9s cubic-bezier(0.77,0,0.175,1), opacity 0.6s ease",
                        }}
                    >
                        <div className="overflow-hidden">
                            <motion.img
                                src={image}
                                alt={imageAlt}
                                loading="lazy"
                                style={reduce ? undefined : {y: imgY, scale: 1.08}}
                                className="aspect-[16/10] w-full object-cover"
                            />
                        </div>
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-line bg-[rgba(8,9,11,0.72)] px-4 py-2 backdrop-blur-[8px]">
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">DBK-{index}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{kicker}</span>
                        </div>
                    </div>
                </div>

                {/* Copy */}
                <div className={cn("order-2", imageFirst ? "lg:order-2" : "lg:order-1")}>
                    <Reveal>
                        <div className="flex items-baseline gap-4">
                            <span className="font-mono text-[13px] font-semibold text-faint">{index}</span>
                            <Eyebrow dot={false}>{kicker}</Eyebrow>
                        </div>
                        <h2 className="mt-5 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold uppercase leading-[1.02] tracking-[0.01em] text-text">
                            {title}
                        </h2>
                        <p className="mt-5 max-w-xl text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-dim">
                            {body}
                        </p>
                    </Reveal>

                    {points.length > 0 && (
                        <ul className="mt-8 space-y-3">
                            {points.map((p, i) => (
                                <Reveal as="li" key={p} delay={0.06 * (i + 1)}>
                                    <div className="flex items-start gap-3 border-t border-hair pt-3">
                                        <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-gold"/>
                                        <span className="text-[15px] leading-relaxed text-dim">{p}</span>
                                    </div>
                                </Reveal>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}
