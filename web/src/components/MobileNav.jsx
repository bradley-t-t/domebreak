import {useEffect, useState} from "react";
import {AnimatePresence, motion, useReducedMotion} from "motion/react";
import {Menu, X, LogIn, LogOut, ShieldCheck} from "lucide-react";
import {cn} from "../lib/cn.js";
import {scrollToId} from "../lib/nav.js";
import {NAV_MENUS} from "../lib/navMenus.js";
import {useAccount} from "../lib/accountStore.js";
import {Wordmark} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";
import NavMenuItem from "./NavMenuItem.jsx";
import SteamCta from "./SteamCta.jsx";

// Mobile navigation: a hamburger that opens a full-height drawer with the same
// grouped menus as the desktop dropdowns, the featured Closed Beta link, the
// Steam CTA, and account actions. Shown only below the md breakpoint.
export default function MobileNav({onSignIn}) {
    const reduce = useReducedMotion();
    const {signedIn, isAdmin, signOut} = useAccount();
    const [open, setOpen] = useState(false);

    // Lock body scroll while the drawer is open.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <div className="md:hidden">
            <button
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-[rgba(16,18,20,0.7)] text-dim transition-colors duration-150 hover:border-blue hover:text-text"
            >
                <Menu size={17}/>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-[120]"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.18}}
                    >
                        <div className="absolute inset-0 bg-[rgba(4,6,9,0.72)] backdrop-blur-[4px]" onClick={close}/>

                        <motion.aside
                            role="menu"
                            aria-label="Site menu"
                            initial={reduce ? {opacity: 0} : {transform: "translateX(100%)"}}
                            animate={reduce ? {opacity: 1} : {transform: "translateX(0%)"}}
                            exit={reduce ? {opacity: 0} : {transform: "translateX(100%)"}}
                            transition={{duration: 0.28, ease: [0.32, 0.72, 0, 1]}}
                            className="db-scroll absolute right-0 top-0 flex h-full w-[min(360px,88vw)] flex-col overflow-y-auto border-l border-line bg-panel-solid shadow"
                        >
                            <div className="flex items-center justify-between border-b border-hair px-5 py-4">
                                <div className="flex items-center gap-2.5">
                                    <GameIcon name="dome" size={20} className="text-gold"/>
                                    <Wordmark className="text-[15px]"/>
                                </div>
                                <button
                                    onClick={close}
                                    aria-label="Close menu"
                                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-dim transition-colors duration-150 hover:border-blue hover:text-text"
                                >
                                    <X size={15}/>
                                </button>
                            </div>

                            <div className="flex-1 px-3 py-4">
                                {/* Featured Closed Beta jump. */}
                                <button
                                    onClick={() => {
                                        close();
                                        scrollToId("beta");
                                    }}
                                    className="group/item mb-3 flex w-full items-center gap-3 rounded-sm border border-gold-line bg-gold-soft px-3 py-3 text-left transition-colors duration-150 hover:border-text"
                                >
                                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
                                    <span className="min-w-0">
                                        <span className="block font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-text">Closed Beta</span>
                                        <span className="mt-0.5 block font-mono text-[10.5px] text-faint">Apply to test before Steam</span>
                                    </span>
                                </button>

                                {NAV_MENUS.map((group) => (
                                    <div key={group.label} className="mt-4 first:mt-0">
                                        <div className="px-3 pb-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-faint">
                                            {group.label}
                                        </div>
                                        {group.items.map((it) => (
                                            <NavMenuItem key={it.label} item={it} onDone={close}/>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-hair p-4">
                                <SteamCta className="w-full" size="md"/>

                                <div className="mt-3">
                                    {signedIn ? (
                                        <div className="flex flex-col gap-1">
                                            {isAdmin && (
                                                <a
                                                    href="#/admin"
                                                    onClick={close}
                                                    className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-[13px] text-dim transition-colors hover:bg-bg-2 hover:text-text"
                                                >
                                                    <ShieldCheck size={15}/>
                                                    <span>Admin Panel</span>
                                                </a>
                                            )}
                                            <button
                                                onClick={() => {
                                                    close();
                                                    signOut();
                                                }}
                                                className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-left text-[13px] text-dim transition-colors hover:bg-bg-2 hover:text-danger"
                                            >
                                                <LogOut size={15}/>
                                                <span>Sign Out</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                close();
                                                onSignIn();
                                            }}
                                            className="flex w-full items-center justify-center gap-2 rounded-sm border border-line px-3 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-dim transition-colors duration-150 hover:border-blue hover:text-text"
                                        >
                                            <LogIn size={14}/>
                                            <span>Sign In</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.aside>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
