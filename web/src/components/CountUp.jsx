import {useEffect, useState} from "react";
import {useInViewOnce} from "../hooks/useInViewOnce.js";

const prefersReduced = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Counts from 0 to `value` the first time it scrolls into view. Falls back to
// the final value immediately under reduced motion.
export default function CountUp({value, duration = 1.4, format = (n) => Math.round(n).toString(), className}) {
    const [ref, inView] = useInViewOnce();
    const reduce = prefersReduced();
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (!inView || reduce) return;
        let raf;
        let start;
        const step = (t) => {
            if (start === undefined) start = t;
            const p = Math.min(1, (t - start) / (duration * 1000));
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(value * eased);
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [inView, value, duration, reduce]);

    return <span ref={ref} className={className}>{format(reduce ? value : display)}</span>;
}
