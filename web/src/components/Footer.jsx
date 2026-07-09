import {Keyboard} from "lucide-react";
import {cn} from "../lib/cn.js";
import {scrollToId} from "../lib/nav.js";
import {Wordmark} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";

const ICON_STRIP = ["dome", "radar", "interceptor", "thaad", "silo", "reconsat", "carrier", "factory"];

function Col({title, children}) {
    return (
        <div className="flex flex-col gap-3">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-faint">{title}</span>
            {children}
        </div>
    );
}

function FootLink({onClick, children}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer"
        >
            {children}
        </button>
    );
}

export default function Footer({onShowShortcuts}) {
    const year = 2026;
    return (
        <footer className="relative overflow-hidden border-t border-line bg-bg">
            <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>

            <div className="relative mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20">
                {/* Top: brand + nav columns */}
                <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
                    <div className="col-span-2 sm:col-span-4 lg:col-span-1">
                        <div className="flex items-center gap-2.5">
                            <GameIcon name="dome" size={22} className="text-gold"/>
                            <Wordmark className="text-[18px]"/>
                        </div>
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                            Global Missile Command
                        </p>
                        <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-dim">
                            A real-time strategy game of missile defense and offense, fought on the real world map.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                            <span className="h-[6px] w-[6px] rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
                            Pre-launch
                        </div>
                    </div>

                    <Col title="Explore">
                        <FootLink onClick={() => scrollToId("top")}>Top</FootLink>
                        <FootLink onClick={() => scrollToId("features")}>Briefing</FootLink>
                    </Col>

                    <Col title="Get it">
                        <FootLink onClick={() => scrollToId("waitlist")}>Request access</FootLink>
                    </Col>

                    <Col title="Help">
                        <FootLink onClick={onShowShortcuts}>
                            <Keyboard size={14}/>
                            Keyboard shortcuts
                        </FootLink>
                    </Col>
                </div>

                {/* Game-asset strip */}
                <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hair pt-6 text-faint">
                    {ICON_STRIP.map((n) => (
                        <GameIcon key={n} name={n} size={18} className="opacity-70 transition-opacity hover:opacity-100"/>
                    ))}
                </div>

                {/* Giant ghost wordmark */}
                <div aria-hidden className="pointer-events-none mt-6 select-none">
                    <span className={cn(
                        "block font-display font-bold uppercase leading-[0.82] tracking-[0.02em]",
                        "text-[clamp(3rem,15vw,12rem)] text-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                    )}>
                        DomeBreak
                    </span>
                </div>

                {/* Legal bar */}
                <div className="mt-6 flex flex-col gap-3 border-t border-hair pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-[11px] text-faint">
                        © {year} TaylorURL · Made solo by Trenton Taylor
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                        macOS + Windows · Coming soon
                    </p>
                </div>
            </div>
        </footer>
    );
}
