import {useMemo, useState} from "react";
import Flag from "../common/Flag.jsx";
import {GREAT_POWERS} from "../../game/sim/newGame.js";
import {button, card, chip, input, label, row} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Nation select: claim the ONE country you command. Rival powers (up to 8, chosen
// on the rules step) are seeded as live AI nations elsewhere on the map, and every
// remaining country is a passive, capturable neutral — so there is no opponent
// roster to pick. The great powers are just quick-claim shortcuts, and search lets
// you claim any nation.
export default function NewGame({data, onStart, onBack, settings}) {
    const [q, setQ] = useState("");
    const [iso, setIso] = useState("US");
    const powers = useMemo(() => GREAT_POWERS
        .map((i) => data?.countries.find((c) => c.iso === i))
        .filter(Boolean), [data]);
    const searchList = useMemo(() => {
        if (!q) return [];
        const needle = q.toLowerCase();
        return (data?.countries || []).filter((c) =>
            !GREAT_POWERS.includes(c.iso) && (c.name.toLowerCase().includes(needle) || c.iso.toLowerCase() === needle)).slice(0, 40);
    }, [data, q]);
    const sel = data?.countries.find((c) => c.iso === iso);
    const countryRow = (active) => cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded border text-left text-text",
        active ? "border-gold-line bg-gold-soft" : "border-transparent bg-transparent hover:bg-black/[0.06]"
    );
    return (
        <div className="absolute inset-0 z-10 grid place-items-center overflow-auto p-6">
            <div className="absolute inset-0 -z-1 bg-[radial-gradient(ellipse_130%_95%_at_50%_42%,transparent_42%,rgba(4,6,9,0.32)_76%,rgba(4,6,9,0.6)_100%)]"/>
            <div className={cn(card(), "db-newgame w-[min(460px,94vw)] text-left max-h-[90vh] overflow-auto")}>
                <div className="text-[26px] tracking-[3px] mb-4 font-bold uppercase m-0 text-dim">New Game</div>
                {!data && <p className="text-dim m-0 mb-5 text-sm leading-[1.5]">Loading world data…</p>}
                <div id="db-newgame-nation-label" className={cn(label(), "flex flex-wrap items-center gap-x-2 gap-y-1.5")}>
                    <span>Choose Your Nation — Every Rival Power Is a Live AI</span>
                    {sel && <span className={cn(chip({subtle: true}), "max-w-full inline-flex items-center gap-1.5 normal-case tracking-normal")}>
                        <Flag iso={sel.iso}/>
                        <span className="truncate">{sel.name}</span>
                    </span>}
                </div>
                <div className="db-country-list flex flex-col gap-1 max-h-[34vh] overflow-auto mt-1.5 border border-line-soft rounded p-1.5 bg-sunk"
                     role="list" aria-labelledby="db-newgame-nation-label">
                    {!GREAT_POWERS.includes(iso) && sel && (
                        <button className={countryRow(true)} role="listitem" onClick={() => setIso(sel.iso)}
                                aria-label={`${sel.name} — you`}>
                            <span className="text-lg w-[22px]"><Flag iso={sel.iso}/></span>
                            <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{sel.name}</span>
                            <span className="flex-none min-w-[34px] text-center font-display text-[10px] font-bold tracking-[1px] uppercase px-2 py-[3px] rounded-sm border border-ink bg-ink text-white">You</span>
                        </button>
                    )}
                    {powers.map((c) => (
                        <button key={c.iso} className={countryRow(iso === c.iso)}
                                role="listitem" onClick={() => setIso(c.iso)}
                                aria-label={`${c.name}${iso === c.iso ? " — you" : ""}`}>
                            <span className="text-lg w-[22px]"><Flag iso={c.iso}/></span>
                            <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{c.name}</span>
                            <span className="font-mono text-xs text-dim">{c.count}</span>
                            {iso === c.iso && <span className="flex-none min-w-[34px] text-center font-display text-[10px] font-bold tracking-[1px] uppercase px-2 py-[3px] rounded-sm border border-ink bg-ink text-white">You</span>}
                        </button>
                    ))}
                </div>
                <label className={cn(label(), "mt-4")} htmlFor="db-newgame-search">Or Search Any Nation</label>
                <input id="db-newgame-search" className={input()} placeholder="Search countries…" value={q}
                       onChange={(e) => setQ(e.target.value)}/>
                {searchList.length > 0 && (
                    <div className="db-country-list flex flex-col gap-1 max-h-[34vh] overflow-auto mt-1.5 border border-line-soft rounded p-1.5 bg-sunk"
                         role="list" style={{maxHeight: "18vh"}}>
                        {searchList.map((c) => (
                            <button key={c.iso} className={countryRow(iso === c.iso)}
                                    role="listitem" aria-label={`${c.name} — you`}
                                    onClick={() => {
                                        setIso(c.iso);
                                        setQ("");
                                    }}>
                                <span className="text-lg w-[22px]"><Flag iso={c.iso}/></span>
                                <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{c.name}</span>
                                <span className="font-mono text-xs text-dim">{c.count}</span>
                            </button>
                        ))}
                    </div>
                )}
                {sel && (
                    <p className="mt-3.5 font-mono text-[11px] text-dim tracking-[0.02em]">
                        Every rival power is a live AI · {settings?.speed ?? 1}&times; · {(settings?.globe ?? true) ? "Globe" : "Flat"} view
                    </p>
                )}
                <div className={row()} style={{marginTop: 14}}>
                    <button className={button()} onClick={onBack}>Back</button>
                    <button className={button({variant: "primary"})} disabled={!sel}
                            onClick={() => onStart(iso)}>Start War
                    </button>
                </div>
            </div>
        </div>
    );
}
