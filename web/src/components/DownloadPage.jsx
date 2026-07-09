import {useEffect} from "react";
import Nav from "./Nav.jsx";
import Footer from "./Footer.jsx";
import Reveal from "./Reveal.jsx";
import GameIcon from "./GameIcon.jsx";
import {Eyebrow} from "./Primitives.jsx";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";

const VERSION = "1.3.0";
const RELEASE_BASE = "https://github.com/bradley-t-t/domebreak/releases/download/v1.3.0";

const BUILDS = [
    {
        id: "mac",
        os: "macOS",
        arch: "Apple Silicon",
        icon: "carrier",
        file: "DomeBreak-1.3.0-arm64.dmg",
        size: "291 MB",
        url: `${RELEASE_BASE}/DomeBreak-1.3.0-arm64.dmg`,
    },
    {
        id: "win",
        os: "Windows",
        arch: "x64 installer",
        icon: "factory",
        file: "DomeBreak.Setup.1.3.0.exe",
        size: "263 MB",
        url: `${RELEASE_BASE}/DomeBreak.Setup.1.3.0.exe`,
    },
];

function BuildCard({build}) {
    return (
        <article className="group relative flex h-full flex-col rounded border border-line bg-bg-2 p-6 db-tick transition-colors duration-200 hover:border-gold-line">
            <header className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-line bg-gold-soft text-gold transition-colors duration-200 group-hover:border-gold-line">
                    <GameIcon name={build.icon} size={34}/>
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[18px] font-bold uppercase tracking-[0.06em] text-text">
                        {build.os}
                    </h2>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
                        {build.arch} · v{VERSION}
                    </p>
                </div>
            </header>

            <div className="mt-6 flex items-baseline justify-between border-t border-hair pt-4">
                <span className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-faint">
                    File
                </span>
                <span className="text-right font-mono text-[12px] text-text">{build.file}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-hair py-2">
                <span className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-faint">
                    Size
                </span>
                <span className="font-mono text-[12px] text-text tabular-nums">{build.size}</span>
            </div>

            <a
                href={build.url}
                className={cn(button({variant: "primary", size: "lg"}), "mt-6 w-full")}
            >
                Download for {build.os}
            </a>
        </article>
    );
}

export default function DownloadPage({onSignIn, onShowShortcuts}) {
    useEffect(() => {
        window.scrollTo({top: 0, behavior: "auto"});
    }, []);

    return (
        <div className="relative min-h-screen bg-bg text-text">
            <Nav onSignIn={onSignIn}/>

            <main>
                <section className="relative overflow-hidden pt-28 pb-14 sm:pt-32 sm:pb-16">
                    <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>
                    <div aria-hidden className="pointer-events-none absolute inset-0 db-vignette"/>
                    <div className="relative mx-auto max-w-[1100px] px-5 sm:px-8">
                        <Reveal>
                            <Eyebrow>Download</Eyebrow>
                            <h1 className="mt-5 max-w-3xl font-display text-[clamp(2rem,5vw,3.6rem)] font-bold uppercase leading-[1.02] text-text">
                                Get <span className="text-dim">DomeBreak</span> v{VERSION}
                            </h1>
                            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-dim">
                                Pick your platform. Installers are hosted on GitHub Releases.
                            </p>
                        </Reveal>
                    </div>
                </section>

                <div className="mx-auto max-w-[1100px] px-5 pb-24 sm:px-8">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {BUILDS.map((b, i) => (
                            <Reveal key={b.id} delay={Math.min(i * 0.06, 0.24)}>
                                <BuildCard build={b}/>
                            </Reveal>
                        ))}
                    </div>

                    <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                        All releases · <a href="https://github.com/bradley-t-t/domebreak/releases" className="text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text">github.com/bradley-t-t/domebreak/releases</a>
                    </p>
                </div>
            </main>

            <Footer onShowShortcuts={onShowShortcuts}/>
        </div>
    );
}
