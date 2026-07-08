import {useEffect, useState} from "react";
import {Download, Monitor, Apple} from "lucide-react";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";
import {detectOS, downloadUrl, fetchLatestRelease, formatBytes, PLATFORMS} from "../lib/download.js";
import Reveal from "./Reveal.jsx";
import {Eyebrow} from "./ui.jsx";

const ICONS = {mac: Apple, win: Monitor};

function InstallerCard({osKey, size, primary}) {
    const p = PLATFORMS[osKey];
    const Icon = ICONS[osKey] || Download;
    return (
        <div
            className={cn(
                "relative db-tick flex flex-col rounded-lg border p-6 sm:p-7",
                primary ? "border-gold-line bg-bg-2" : "border-line bg-bg"
            )}
        >
            <div className="flex items-center gap-3">
                <Icon size={20} strokeWidth={1.6} className="text-text"/>
                <div>
                    <div className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-text">
                        {p.label}
                    </div>
                    <div className="font-mono text-[11px] text-faint">{p.note}</div>
                </div>
            </div>

            <a
                href={downloadUrl(osKey)}
                className={cn(button({variant: primary ? "primary" : "default", size: "lg"}), "mt-6 w-full")}
            >
                <Download size={15}/>
                <span>Download {p.ext}</span>
            </a>

            <div className="mt-3 font-mono text-[11px] text-faint">
                {size ? `${formatBytes(size)} · ` : ""}Free · Standalone installer
            </div>
        </div>
    );
}

export default function DownloadSection() {
    const [os, setOs] = useState("other");
    const [rel, setRel] = useState(null);

    useEffect(() => {
        setOs(detectOS());
        fetchLatestRelease().then(setRel);
    }, []);

    const other = os === "mac" ? "win" : "mac";
    const showBoth = os === "other";
    const sizes = rel?.sizes || {};

    return (
        <section id="download" className="relative scroll-mt-16 border-t border-line">
            <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>
            <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 sm:py-28">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
                    <Reveal>
                        <Eyebrow>Deploy</Eyebrow>
                        <h2 className="mt-5 font-display text-[clamp(1.9rem,4.5vw,3.2rem)] font-bold uppercase leading-[1.03] text-text">
                            Download the game
                        </h2>
                        <p className="mt-5 max-w-md text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-dim">
                            Native desktop build for macOS and Windows. Fully playable offline —
                            saves stay on your machine.
                        </p>
                        <div className="mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                            <span className="inline-block h-[6px] w-[6px] rounded-full bg-gold"/>
                            <span>{rel?.version ? `Version ${rel.version}` : "Latest build"}</span>
                            {os !== "other" && (
                                <>
                                    <span className="text-line">·</span>
                                    <span>Detected: {PLATFORMS[os].label}</span>
                                </>
                            )}
                        </div>
                    </Reveal>

                    <Reveal delay={0.12}>
                        {showBoth ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <InstallerCard osKey="mac" size={sizes.mac} primary/>
                                <InstallerCard osKey="win" size={sizes.win} primary/>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <InstallerCard osKey={os} size={sizes[os]} primary/>
                                <div className="flex items-center justify-center gap-2 font-mono text-[12px] text-dim">
                                    <span className="text-faint">Also on</span>
                                    <a
                                        href={downloadUrl(other)}
                                        className="text-dim underline decoration-line underline-offset-4 transition-colors hover:text-text"
                                    >
                                        {PLATFORMS[other].label} ({PLATFORMS[other].ext})
                                    </a>
                                </div>
                            </div>
                        )}
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
