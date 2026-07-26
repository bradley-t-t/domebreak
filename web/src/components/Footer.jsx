import {Keyboard} from "lucide-react";
import {scrollToId} from "../lib/nav.js";
import {NAV_MENUS} from "../lib/navMenus.js";
import {Wordmark} from "./Primitives.jsx";
import GameIcon from "./GameIcon.jsx";
import PlayCta from "./PlayCta.jsx";
import ScrollVelocity from "./reactbits/ScrollVelocity.jsx";

const ICON_STRIP = ["dome", "radar", "interceptor", "thaad", "silo", "reconsat", "carrier", "factory"];

// Single release version, injected from the game's package.json at build time
// (web/vite.config.js) — the same number the download page and installers ship.
// Never hardcode a version here; it drifts the moment a release goes out.
const VERSION = __APP_VERSION__;

function Col({title, children}) {
    return (
        <div className="flex flex-col gap-3">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-faint">{title}</span>
            {children}
        </div>
    );
}

// A footer link that either scrolls/routes internally or opens an external URL.
function FootLink({children, onClick, href}) {
    const cls = "flex items-center gap-2 text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer";
    if (href) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
    }
    return <button onClick={onClick} className={cls}>{children}</button>;
}

// Render one of the shared nav groups as a footer column so the footer and the
// nav never disagree on what exists or how it's labelled.
function MenuCol({group}) {
    return (
        <Col title={group.label}>
            {group.items.map((it) =>
                it.external
                    ? <FootLink key={it.label} href={it.external}>{it.label}</FootLink>
                    : <FootLink key={it.label} onClick={() => scrollToId(it.target)}>{it.label}</FootLink>
            )}
        </Col>
    );
}

export default function Footer({onShowShortcuts}) {
    const year = 2026;
    return (
        <footer className="relative overflow-hidden border-t border-line bg-bg">
            <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>

            {/* react-bits ScrollVelocity — a slow, scroll-reactive ghost marquee of
                the wordmark that replaces the old static giant lettering. */}
            <div aria-hidden className="relative select-none border-b border-hair py-7">
                <ScrollVelocity
                    texts={["DomeBreak · Global Missile Command ·"]}
                    velocity={26}
                    numCopies={4}
                    damping={40}
                    className="font-display font-bold uppercase tracking-[0.04em] text-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                />
            </div>

            <div className="relative mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20">
                <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-[1.7fr_1fr_1fr_1fr]">
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
                        <div className="mt-6">
                            <PlayCta size="md"/>
                        </div>
                        <div className="mt-5 inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                            <span className="h-[6px] w-[6px] rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
                            Now Live · Free to Play
                        </div>
                    </div>

                    {NAV_MENUS.map((group) => <MenuCol key={group.label} group={group}/>)}

                    <Col title="More">
                        <FootLink onClick={() => scrollToId("play")}>
                            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>
                            Play Free
                        </FootLink>
                        <FootLink onClick={() => scrollToId("top")}>Top</FootLink>
                        <FootLink onClick={onShowShortcuts}>
                            <Keyboard size={14}/>
                            Keyboard Shortcuts
                        </FootLink>
                    </Col>
                </div>

                <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hair pt-6 text-faint">
                    {ICON_STRIP.map((n) => (
                        <GameIcon key={n} name={n} size={18} className="opacity-70 transition-opacity hover:opacity-100"/>
                    ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-hair pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-[11px] text-faint">
                        © {year} TaylorURL · Made solo by Trenton Taylor
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                        macOS + Windows · v{VERSION}
                    </p>
                </div>
            </div>
        </footer>
    );
}
