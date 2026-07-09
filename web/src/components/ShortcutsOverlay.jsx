import {useEffect} from "react";
import {AnimatePresence, motion} from "motion/react";
import {X} from "lucide-react";
import {SHORTCUTS} from "../lib/nav.js";
import {Eyebrow} from "./Primitives.jsx";

const EXTRA = [
    {hint: "S", label: "Sign in / account"},
    {hint: "?", label: "Toggle this menu"},
    {hint: "Esc", label: "Close"},
];

function Kbd({children}) {
    return (
        <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-sm border border-line bg-sunk px-2 py-1 font-mono text-[11px] font-semibold uppercase text-text">
            {children}
        </kbd>
    );
}

export default function ShortcutsOverlay({open, onClose}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                    transition={{duration: 0.16}}
                >
                    <div className="absolute inset-0 bg-[rgba(4,6,9,0.72)] backdrop-blur-[4px]" onClick={onClose}/>
                    <motion.div
                        role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
                        initial={{opacity: 0, transform: "translateY(10px) scale(0.98)"}}
                        animate={{opacity: 1, transform: "translateY(0px) scale(1)"}}
                        exit={{opacity: 0, transform: "translateY(8px) scale(0.98)"}}
                        transition={{duration: 0.2, ease: [0.23, 1, 0.32, 1]}}
                        className="relative db-tick db-seam w-[min(400px,94vw)] rounded-lg border border-line bg-panel-solid p-7 shadow"
                    >
                        <button
                            onClick={onClose} aria-label="Close"
                            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-sm border border-line text-dim transition-colors hover:border-blue hover:text-text"
                        >
                            <X size={15}/>
                        </button>
                        <Eyebrow>Command</Eyebrow>
                        <h2 className="mt-4 font-display text-[20px] font-bold uppercase tracking-[0.04em] text-text">Keyboard shortcuts</h2>
                        <div className="mt-6 space-y-1">
                            {[...SHORTCUTS, ...EXTRA].map((s) => (
                                <div key={s.hint} className="flex items-center justify-between border-t border-hair py-2.5 first:border-t-0">
                                    <span className="text-[13.5px] text-dim">{s.label}</span>
                                    <Kbd>{s.hint}</Kbd>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
