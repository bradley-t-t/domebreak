import {useEffect} from "react";
import Nav from "./Nav.jsx";
import Footer from "./Footer.jsx";
import Reveal from "./Reveal.jsx";
import GameIcon from "./GameIcon.jsx";
import {Eyebrow} from "./Primitives.jsx";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";

// Version comes from the game's package.json at build time (web/vite.config.js)
// — the same number the installers and match server ship with. Installers are
// self-hosted on the DomeBreak VPS: the stable root names are symlinks the
// release process repoints at the newest release, so these links always serve
// the latest installers and never dead-end mid-release. Past versions live under
// /vX.Y.Z/ on the same host.
const VERSION = __APP_VERSION__;
const RELEASE_BASE = "https://download.domebreak.com";

// One card per OS, one download per architecture. The file names are the stable
// symlinks the release process repoints at the newest release (build-dist.sh emits
// exactly these names), so every link always serves the latest build.
const PLATFORMS = [
    {
        id: "mac",
        os: "macOS",
        icon: "carrier",
        note: "macOS 10.13+",
        builds: [
            {arch: "Apple Silicon", sub: "M1 and newer", file: "DomeBreak-mac-arm64.dmg"},
            {arch: "Intel", sub: "64-bit", file: "DomeBreak-mac-x64.dmg"},
        ],
    },
    {
        id: "win",
        os: "Windows",
        icon: "factory",
        note: "Windows 10+",
        builds: [
            {arch: "x64", sub: "64-bit, most PCs", file: "DomeBreak-win-x64.exe"},
            {arch: "ARM64", sub: "Windows on ARM", file: "DomeBreak-win-arm64.exe"},
            {arch: "32-bit", sub: "Legacy x86", file: "DomeBreak-win-ia32.exe"},
        ],
    },
];

function PlatformCard({platform}) {
    return (
        <article className="group relative flex h-full flex-col rounded border border-line bg-bg-2 p-6 db-tick transition-colors duration-200 hover:border-gold-line">
            <header className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-line bg-gold-soft text-gold transition-colors duration-200 group-hover:border-gold-line">
                    <GameIcon name={platform.icon} size={34}/>
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[18px] font-bold uppercase tracking-[0.06em] text-text">
                        {platform.os}
                    </h2>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
                        {platform.note} · v{VERSION}
                    </p>
                </div>
            </header>

            <div className="mt-6 flex flex-col gap-2 border-t border-hair pt-5">
                {platform.builds.map((b) => (
                    <a
                        key={b.file}
                        href={`${RELEASE_BASE}/${b.file}`}
                        className={cn(button({variant: "primary", size: "lg"}), "w-full justify-between gap-3")}
                    >
                        <span>{b.arch}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">{b.sub}</span>
                    </a>
                ))}
            </div>
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
                                Free to play. Pick your platform — installers are served straight from the
                                DomeBreak server. See First launch below the first time you open the game.
                            </p>
                        </Reveal>
                    </div>
                </section>

                <div className="mx-auto max-w-[1100px] px-5 pb-24 sm:px-8">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {PLATFORMS.map((p, i) => (
                            <Reveal key={p.id} delay={Math.min(i * 0.06, 0.24)}>
                                <PlatformCard platform={p}/>
                            </Reveal>
                        ))}
                    </div>

                    <Reveal>
                        <div className="mt-12 rounded border border-line bg-bg-2 p-6">
                            <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-faint">
                                First launch
                            </h3>
                            <p className="mt-3 text-[13px] leading-relaxed text-dim">
                                DomeBreak isn't signed with a paid developer certificate yet, so the first time you
                                open it your OS asks you to confirm. This is a one-time step per install.
                            </p>
                            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                                <div className="border-t border-hair pt-3">
                                    <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-text">macOS</dt>
                                    <dd className="mt-1 text-[13px] leading-relaxed text-dim">
                                        Drag DomeBreak to Applications and open it. If macOS says it can't verify the
                                        developer, go to System Settings → Privacy &amp; Security, scroll down, and click
                                        <span className="text-text"> Open Anyway</span>.
                                    </dd>
                                </div>
                                <div className="border-t border-hair pt-3">
                                    <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-text">Windows</dt>
                                    <dd className="mt-1 text-[13px] leading-relaxed text-dim">
                                        Run the installer. If Windows SmartScreen warns about an unknown publisher, click
                                        <span className="text-text"> More info</span> then
                                        <span className="text-text"> Run anyway</span>.
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </Reveal>

                    <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                        All versions · <a href="https://download.domebreak.com/" className="text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text">download.domebreak.com</a>
                    </p>
                </div>
            </main>

            <Footer onShowShortcuts={onShowShortcuts}/>
        </div>
    );
}
