import {Keyboard} from "lucide-react";
import {Wordmark} from "./ui.jsx";

export default function Footer({onShowShortcuts}) {
    const year = 2026;
    return (
        <footer className="border-t border-line bg-bg">
            <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8">
                <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <Wordmark className="text-[18px]"/>
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                            Global Missile Command
                        </p>
                        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-dim">
                            A real-time strategy game of missile defense and offense on a living world map.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-faint">
                            Signal
                        </span>
                        <button
                            onClick={() => document.getElementById("download")?.scrollIntoView({behavior: "smooth"})}
                            className="text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer"
                        >
                            Download
                        </button>
                        <button
                            onClick={() => document.getElementById("waitlist")?.scrollIntoView({behavior: "smooth"})}
                            className="text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer"
                        >
                            Request access
                        </button>
                        <button
                            onClick={() => document.getElementById("features")?.scrollIntoView({behavior: "smooth"})}
                            className="text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer"
                        >
                            Briefing
                        </button>
                        <button
                            onClick={onShowShortcuts}
                            className="flex items-center gap-2 text-left text-[13px] text-dim transition-colors duration-150 hover:text-text cursor-pointer"
                        >
                            <Keyboard size={14}/>
                            Keyboard shortcuts
                        </button>
                    </div>
                </div>

                <div className="mt-12 flex flex-col gap-3 border-t border-hair pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-[11px] text-faint">
                        © {year} TaylorURL · Made solo by Trenton Taylor
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                        Status: <span className="text-dim">Pre-Launch</span>
                        <span className="ml-2 inline-block h-[6px] w-[6px] translate-y-[-1px] rounded-full bg-danger db-blink"/>
                    </p>
                </div>
            </div>
        </footer>
    );
}
