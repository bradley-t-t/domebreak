import {useEffect, useId, useRef, useState} from "react";
import {AnimatePresence, motion, useReducedMotion} from "motion/react";
import {ChevronDown} from "lucide-react";
import {cn} from "../lib/cn.js";
import NavMenuItem from "./NavMenuItem.jsx";

// Desktop nav dropdown. Opens on hover (with a small close-delay so the pointer
// can travel to the panel) and on click; closes on outside click, Escape, or
// selecting an item. The panel is a compact "mega menu" of NavMenuItems.
export default function NavDropdown({label, items}) {
    const reduce = useReducedMotion();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const closeTimer = useRef(null);
    const id = useId();

    const clearClose = () => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };
    const scheduleClose = () => {
        clearClose();
        closeTimer.current = setTimeout(() => setOpen(false), 120);
    };

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDoc);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    useEffect(() => () => clearClose(), []);

    return (
        <div
            ref={ref}
            className="relative"
            onMouseEnter={() => {
                clearClose();
                setOpen(true);
            }}
            onMouseLeave={scheduleClose}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={id}
                className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors duration-150 cursor-pointer",
                    open ? "text-text" : "text-dim hover:text-text"
                )}
            >
                {label}
                <ChevronDown size={13} className={cn("text-faint transition-transform duration-200", open && "rotate-180 text-dim")}/>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        id={id}
                        role="menu"
                        aria-label={label}
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(-6px) scale(0.98)"}}
                        animate={reduce ? {opacity: 1} : {opacity: 1, transform: "translateY(0px) scale(1)"}}
                        exit={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(-6px) scale(0.98)"}}
                        transition={{duration: 0.16, ease: [0.23, 1, 0.32, 1]}}
                        style={{transformOrigin: "top left"}}
                        className="db-seam absolute left-0 top-[calc(100%+10px)] w-[300px] overflow-hidden rounded-lg border border-line bg-panel-2 p-2 shadow backdrop-blur-[14px]"
                    >
                        {items.map((it) => (
                            <NavMenuItem key={it.label} item={it} onDone={() => setOpen(false)}/>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
