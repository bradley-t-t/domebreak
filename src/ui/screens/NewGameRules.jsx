import {useState} from "react";
import Flag from "../common/Flag.jsx";
import GameRulesForm from "./GameRulesForm.jsx";
import AiNationPicker from "./AiNationPicker.jsx";
import {DEFAULT_RULES, normalizeRules} from "../../game/sim/gameRules.js";
import {button, card, chip, row} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// SP step 2: after the commander picks their nation on NewGame, this screen
// lets them customize the war before it launches. Rules live in local state
// here, seeded from the last-chosen set (passed in as `initialRules`), and are
// handed back to App on Start War.
export default function NewGameRules({data, iso, initialRules, onStart, onBack}) {
    const [rules, setRules] = useState(() => normalizeRules(initialRules ?? DEFAULT_RULES));
    const [aiOpen, setAiOpen] = useState(false);
    const nation = data?.countries?.find((c) => c.iso === iso);
    // The commander can never pin their own nation as an AI opponent — drop it if a
    // stale saved pin list carries it, and hide it from the picker.
    const aiPicks = (rules.aiPicks || []).filter((p) => p !== iso);
    const setAiPicks = (next) => setRules((r) => normalizeRules({...r, aiPicks: next}));
    return (
        <div className="absolute inset-0 z-10 grid place-items-center overflow-auto p-6">
            <div className="absolute inset-0 -z-1 bg-[radial-gradient(ellipse_130%_95%_at_50%_42%,transparent_42%,rgba(4,6,9,0.32)_76%,rgba(4,6,9,0.6)_100%)]"/>
            <div className={cn(card(), "w-[min(520px,94vw)] text-left max-h-[92vh] overflow-auto")}>
                <div className="text-[26px] tracking-[3px] mb-2 font-bold uppercase m-0 text-dim">Game Rules</div>
                <p className="text-dim m-0 mb-4 text-sm leading-[1.5]">
                    Set the war's terms — participating nations, opening economy, and victory conditions.
                </p>
                {nation && (
                    <div className="mb-4 flex items-center gap-2">
                        <span className="font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint">Commander</span>
                        <span className={cn(chip({subtle: true}), "inline-flex items-center gap-1.5 normal-case tracking-normal")}>
                            <Flag iso={nation.iso}/>
                            <span className="truncate">{nation.name}</span>
                        </span>
                    </div>
                )}
                <GameRulesForm mode="sp" rules={rules} onChange={setRules}/>
                <div className="mt-3 flex flex-col gap-[9px]">
                    <button
                        type="button"
                        className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-sm border border-line-soft bg-sunk text-left transition-colors hover:border-line",
                            aiOpen && "border-gold-line bg-gold-soft"
                        )}
                        onClick={() => setAiOpen((o) => !o)}
                        aria-expanded={aiOpen}
                        aria-controls="db-newgame-ai-nations"
                    >
                        <span className="flex flex-col">
                            <span className="font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint">AI Nations</span>
                            <span className="text-[12px] text-dim">{aiPicks.length ? `${aiPicks.length} pinned` : "Random"}</span>
                        </span>
                        <span className={cn("font-mono text-[11px] text-dim transition-transform", aiOpen && "rotate-90")}>&rsaquo;</span>
                    </button>
                    {aiOpen && (
                        <div id="db-newgame-ai-nations" className="rounded-sm border border-line-soft bg-sunk p-3">
                            <p className="mt-0 mb-2.5 text-[11px] leading-snug text-dim">
                                Pin the nations you want to fight. Pinned nations always join the war; any
                                remaining Active Nations slots are filled at random. Leave empty for a fully random cast.
                            </p>
                            <AiNationPicker data={data} selected={aiPicks} excludeIso={iso} onChange={setAiPicks}/>
                        </div>
                    )}
                </div>
                <div className={row()} style={{marginTop: 18}}>
                    <button className={button()} onClick={onBack}>Back</button>
                    <button className={button({variant: "primary"})} onClick={() => onStart(rules)}>Start War</button>
                </div>
            </div>
        </div>
    );
}
