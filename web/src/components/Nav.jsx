import {useEffect, useState} from "react";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";
import {scrollToId} from "../lib/nav.js";
import {useAccount} from "../lib/accountStore.js";
import {Wordmark} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";
import AccountMenu from "./AccountMenu.jsx";

function NavLink({to, children}) {
    return (
        <button
            onClick={() => scrollToId(to)}
            className="hidden font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-dim transition-colors duration-150 hover:text-text md:inline-block px-3 py-2 cursor-pointer"
        >
            {children}
        </button>
    );
}

export default function Nav({onSignIn}) {
    const {loading, signedIn} = useAccount();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, {passive: true});
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header
            className={cn(
                "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out-db",
                scrolled
                    ? "border-b border-line bg-[rgba(8,9,11,0.72)] backdrop-blur-[14px] backdrop-saturate-[1.1]"
                    : "border-b border-transparent bg-transparent"
            )}
        >
            <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 sm:px-8">
                <button
                    onClick={() => scrollToId("top")}
                    className="flex items-center gap-2.5 cursor-pointer"
                    aria-label="DomeBreak home"
                >
                    <GameIcon name="dome" size={22} className="text-gold"/>
                    <Wordmark className="text-[16px]"/>
                    <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-faint lg:inline">
                        Global Missile Command
                    </span>
                </button>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    <NavLink to="features">Briefing</NavLink>
                    <NavLink to="wiki">Wiki</NavLink>
                    <NavLink to="download">Download</NavLink>

                    {loading ? (
                        <div className="h-9 w-9 rounded-sm border border-line bg-panel"/>
                    ) : signedIn ? (
                        <AccountMenu/>
                    ) : (
                        <>
                            <button
                                onClick={onSignIn}
                                className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-dim transition-colors duration-150 hover:text-text px-3 py-2 cursor-pointer"
                            >
                                Sign in
                            </button>
                            <button
                                onClick={() => scrollToId("waitlist")}
                                className={cn(button({variant: "primary", size: "sm"}))}
                            >
                                Request Access
                            </button>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}
