import {useEffect, useRef, useState} from "react";
import {AnimatePresence, motion} from "motion/react";
import {ChevronDown, LogOut} from "lucide-react";
import {cn} from "../lib/cn.js";
import {useAccount} from "../lib/accountStore.js";
import GameIcon from "./GameIcon.jsx";

function monthYear(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-US", {month: "short", year: "numeric"});
}

function Avatar({avatar, name, size = 26}) {
    if (avatar) {
        return (
            <span
                className="flex shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold"
                style={{width: size, height: size}}
            >
                <GameIcon name={avatar} size={size * 0.6}/>
            </span>
        );
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft font-display text-[12px] font-bold text-gold"
            style={{width: size, height: size}}
        >
            {(name || "?").slice(0, 1).toUpperCase()}
        </span>
    );
}

function Stat({value, label}) {
    return (
        <div>
            <div className="font-mono text-[15px] font-semibold text-text tabular-nums">{value}</div>
            <div className="mt-[2px] font-display text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</div>
        </div>
    );
}

export default function AccountMenu() {
    const {profile, stats, signOut} = useAccount();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDoc);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const name = profile?.username || "Player";
    const total = stats?.total_matches ?? 0;
    const wins = stats?.wins ?? 0;
    const losses = stats?.losses ?? 0;
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    const hours = ((stats?.total_playtime_s ?? 0) / 3600).toFixed(1);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-sm border border-line bg-[rgba(16,18,20,0.7)] py-[6px] pl-[6px] pr-2 text-text transition-colors duration-150 hover:border-blue"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Avatar avatar={profile?.avatar} name={name}/>
                <span className="hidden max-w-[120px] truncate font-display text-[12px] font-semibold tracking-[0.04em] sm:inline">{name}</span>
                <ChevronDown size={13} className={cn("text-faint transition-transform duration-200", open && "rotate-180")}/>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{opacity: 0, transform: "translateY(-6px) scale(0.98)"}}
                        animate={{opacity: 1, transform: "translateY(0px) scale(1)"}}
                        exit={{opacity: 0, transform: "translateY(-6px) scale(0.98)"}}
                        transition={{duration: 0.16, ease: [0.23, 1, 0.32, 1]}}
                        style={{transformOrigin: "top right"}}
                        className="db-seam absolute right-0 top-[calc(100%+8px)] w-[280px] overflow-hidden rounded-lg border border-line bg-panel-2 shadow backdrop-blur-[14px]"
                    >
                        <div className="flex items-center gap-3 border-b border-hair p-4">
                            <Avatar avatar={profile?.avatar} name={name} size={38}/>
                            <div className="min-w-0">
                                <div className="truncate font-display text-[14px] font-bold text-text">{name}</div>
                                <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                                    {profile?.created_at ? `Member since ${monthYear(profile.created_at)}` : "Player"}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 border-b border-hair p-4">
                            <Stat value={`${wins}W`} label="Wins"/>
                            <Stat value={`${losses}L`} label="Losses"/>
                            <Stat value={`${winRate}%`} label="Win rate"/>
                            <Stat value={total} label="Matches"/>
                            <Stat value={`${hours}h`} label="Playtime"/>
                        </div>

                        <div className="p-2">
                            <button
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    signOut();
                                }}
                                className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-[13px] text-dim transition-colors hover:bg-bg-2 hover:text-danger"
                            >
                                <LogOut size={15}/>
                                <span>Sign out</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
