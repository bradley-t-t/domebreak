import {useEffect, useState} from "react";
import {cn} from "../lib/cn.js";
import {scrollToId} from "../lib/nav.js";
import {NAV_MENUS} from "../lib/navMenus.js";
import {useAccount} from "../lib/accountStore.js";
import {Wordmark} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";
import AccountMenu from "./AccountMenu.jsx";
import NavDropdown from "./NavDropdown.jsx";
import MobileNav from "./MobileNav.jsx";
import {PlayNavLink} from "./PlayCta.jsx";

// Featured, always-visible link to the "play free" band — the site's headline
// call to action, so it gets a live status dot instead of sitting in a menu.
function PlayLink() {
    return (
        <button
            onClick={() => scrollToId("play")}
            className="hidden items-center gap-2 rounded-sm px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-text transition-colors duration-150 hover:text-gold-hi md:inline-flex cursor-pointer"
        >
            <span className="h-[6px] w-[6px] rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
            Play Free
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

                {/* Desktop menu cluster — grouped dropdowns + featured beta link. */}
                <div className="hidden items-center md:flex">
                    {NAV_MENUS.map((group) => (
                        <NavDropdown key={group.label} label={group.label} items={group.items}/>
                    ))}
                    <PlayLink/>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    <PlayNavLink className="hidden sm:inline-flex"/>

                    {loading ? (
                        <div className="hidden h-9 w-9 rounded-sm border border-line bg-panel md:block"/>
                    ) : signedIn ? (
                        <div className="hidden md:block">
                            <AccountMenu/>
                        </div>
                    ) : (
                        <button
                            onClick={onSignIn}
                            className="hidden font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-dim transition-colors duration-150 hover:text-text px-3 py-2 cursor-pointer md:inline-block"
                        >
                            Sign In
                        </button>
                    )}

                    <MobileNav onSignIn={onSignIn}/>
                </div>
            </nav>
        </header>
    );
}
