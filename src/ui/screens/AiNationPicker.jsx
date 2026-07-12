import {useMemo, useState} from "react";
import Flag from "../common/Flag.jsx";
import {GREAT_POWERS} from "../../game/sim/newGame.js";
import {chip, input} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Multi-select for pinning the exact nations the AI will field. Empty selection =
// fully random (buildSetup fills the roster from the power pool). Picks here are
// forced-active AI belligerents; the map's other countries stay passive neutrals.
// Modeled on NewGame's great-power quick-pick + free-search pattern. `excludeIso`
// is the commander's own nation, which can never be pinned as an opponent.
export default function AiNationPicker({data, selected, excludeIso, onChange}) {
    const [q, setQ] = useState("");
    const picked = useMemo(() => new Set(selected), [selected]);
    const nameOf = (iso) => data?.countries?.find((c) => c.iso === iso)?.name || iso;
    const toggle = (iso) => {
        if (iso === excludeIso) return;
        onChange(picked.has(iso) ? selected.filter((i) => i !== iso) : [...selected, iso]);
    };
    const quickPicks = useMemo(() => GREAT_POWERS
        .filter((iso) => iso !== excludeIso && !picked.has(iso))
        .map((iso) => data?.countries?.find((c) => c.iso === iso))
        .filter(Boolean), [data, excludeIso, picked]);
    const searchList = useMemo(() => {
        if (!q) return [];
        const needle = q.toLowerCase();
        return (data?.countries || []).filter((c) =>
            c.iso !== excludeIso && !picked.has(c.iso) &&
            (c.name.toLowerCase().includes(needle) || c.iso.toLowerCase() === needle)).slice(0, 30);
    }, [data, q, excludeIso, picked]);
    const pickRow = "flex items-center gap-2.5 px-2.5 py-2 rounded border border-transparent bg-transparent hover:bg-black/[0.06] text-left text-text";
    return (
        <div className="flex flex-col gap-2.5">
            {selected.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" role="list" aria-label="Pinned AI nations">
                    {selected.map((iso) => (
                        <button key={iso} type="button" role="listitem"
                                className={cn(chip({subtle: true}), "inline-flex items-center gap-1.5 normal-case tracking-normal hover:text-text hover:border-line")}
                                onClick={() => toggle(iso)}
                                aria-label={`Remove ${nameOf(iso)}`}>
                            <Flag iso={iso}/>
                            <span className="truncate max-w-[120px]">{nameOf(iso)}</span>
                            <span aria-hidden="true" className="text-faint">&times;</span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="m-0 text-[12px] text-dim leading-snug">
                    No nations pinned — the AI roster is filled at random.
                </p>
            )}
            {quickPicks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {quickPicks.map((c) => (
                        <button key={c.iso} type="button"
                                className="inline-flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-[0.5px] text-dim border border-line-soft rounded-sm px-2 py-1 hover:text-text hover:border-line"
                                onClick={() => toggle(c.iso)}
                                aria-label={`Pin ${c.name}`}>
                            <Flag iso={c.iso}/>
                            <span className="truncate max-w-[110px]">{c.name}</span>
                            <span aria-hidden="true" className="text-faint">+</span>
                        </button>
                    ))}
                </div>
            )}
            <input className={input()} placeholder="Search any nation to pin…" value={q}
                   onChange={(e) => setQ(e.target.value)} aria-label="Search AI nations"/>
            {searchList.length > 0 && (
                <div className="db-country-list flex flex-col gap-1 overflow-auto border border-line-soft rounded p-1.5 bg-sunk"
                     role="list" style={{maxHeight: "20vh"}}>
                    {searchList.map((c) => (
                        <button key={c.iso} className={pickRow} role="listitem"
                                aria-label={`Pin ${c.name}`}
                                onClick={() => { toggle(c.iso); setQ(""); }}>
                            <span className="text-lg w-[22px]"><Flag iso={c.iso}/></span>
                            <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{c.name}</span>
                            <span className="font-mono text-xs text-dim">{c.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
