import {useEffect, useRef, useState} from "react";

// Reveal-on-scroll built on the native IntersectionObserver. More reliable than
// motion's whileInView wrapper (which didn't fire for already-in-view elements
// here), and it fails OPEN: if IO is unavailable, content shows immediately.
// The observer also emits an initial callback for elements already on screen,
// so above-the-fold content reveals right away.
export function useInViewOnce({rootMargin = "-10% 0px -10% 0px"} = {}) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") {
            setInView(true);
            return;
        }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setInView(true);
                io.disconnect();
            }
        }, {rootMargin, threshold: 0.01});
        io.observe(el);
        // Safety net: if nothing fires shortly (odd layouts, detached roots),
        // reveal anyway so content is never permanently hidden.
        const t = setTimeout(() => setInView((v) => v || isRoughlyInView(el)), 600);
        return () => {
            io.disconnect();
            clearTimeout(t);
        };
    }, [rootMargin]);

    return [ref, inView];
}

function isRoughlyInView(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top < vh && r.bottom > 0;
}
