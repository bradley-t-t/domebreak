import {createElement} from "react";
import {useInViewOnce} from "../lib/useInViewOnce.js";

// Scroll-reveal wrapper: fades + lifts children the first time they enter view.
// Native-IO based (see useInViewOnce) so it always eventually shows. Reduced
// motion is honored via a CSS override in index.css (.db-reveal → no transform).
export default function Reveal({children, delay = 0, y = 22, className, as = "div"}) {
    const [ref, inView] = useInViewOnce();
    const style = {
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 0.7s cubic-bezier(0.23,1,0.32,1) ${delay}s, transform 0.7s cubic-bezier(0.23,1,0.32,1) ${delay}s`,
        willChange: "opacity, transform",
    };
    return createElement(as, {ref, className: `db-reveal ${className || ""}`.trim(), style}, children);
}
