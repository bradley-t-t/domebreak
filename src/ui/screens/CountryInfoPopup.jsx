// Country dossier — a full-modal deep-dive for a single power, opened from
// any flag click (Tab scoreboard, WarBar) or a right-click on the hovered
// country plaque. Shares its shell with Production / Diplomacy (ScreenFrame,
// Esc-to-close, focus trap) so it reads as another top-bar screen even
// though it's context-triggered. Presentation only — every war / peace /
// alliance action goes through the same api entry points DiplomacyScreen
// uses.
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import {colorForSlot, DIPLOMACY} from "../../game/data/constants.js";
import {miniButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import {fmtGdp, fmtPop} from "../lib/format.js";
import {useRoster} from "../lib/roster.js";
import {gdpOf, populationOf} from "../../game/engine.js";

export default function CountryInfoPopup({world, api, mySlot, online, targetSlot, players, onClose}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const n = world.nations.find((x) => x.slot === targetSlot);

    const {usernameOf, isHuman} = useRoster(players);

    if (!n) {
        return (
            <ScreenFrame title="Unknown Power" onClose={onClose}>
                <p className="font-mono text-[12px] text-dim">This power is no longer in the roster.</p>
            </ScreenFrame>
        );
    }

    const isMe = n.slot === mySlot;
    const neutral = n.active === false;
    const eliminated = !n.alive;
    const rel = isMe ? "self"
        : me?.relations[n.slot] === "war" ? "war"
            : me?.relations[n.slot] === "ally" ? "ally" : "peace";

    const cities = world.cities.filter((c) => c.slot === n.slot && c.alive).length;
    const forces = world.units.filter((u) => u.slot === n.slot && u.hp > 0).length;
    const pop = populationOf(world, n.slot);
    const gdp = gdpOf(world, n.slot);

    const human = isHuman(n.slot);
    const seatLabel = isMe ? "You" : human ? "Player" : "AI";
    const seatCls = isMe ? "text-gold-contrast bg-gold border-gold"
        : human ? "text-[#5fa8ff] border-[#3f5a80]" : "";
    const commander = isMe ? "You"
        : human ? usernameOf.get(n.slot) || "Commander"
            : null;

    const standing = isMe ? {label: "Home", tone: "text-dim"}
        : neutral ? {label: "Neutral", tone: "text-dim"}
            : eliminated ? {label: "Eliminated", tone: "text-dim"}
                : rel === "war" ? {label: "At War", tone: "text-red"}
                    : rel === "ally" ? {label: "Allied", tone: "text-[#5fa8ff]"}
                        : {label: "At Peace", tone: "text-[#46d38a]"};

    const call = (fn, ok) => {
        const r = fn();
        if (r?.error) return;
        if (ok) ok();
        onClose();
    };

    const canAct = !isMe && !neutral && !eliminated;
    const graceSec = world.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec;
    const graceActive = graceSec > 0 && (world.time ?? 0) < graceSec;
    const borderColor = n.color || colorForSlot(n.slot);

    return (
        <ScreenFrame title={n.name.toUpperCase()} subtitle={`${seatLabel}${commander && !isMe ? ` · ${commander}` : ""}`}
                     onClose={onClose}>
            <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4 p-4 bg-sunk border border-line rounded">
                    <span className="flex-none w-[72px] h-[48px] grid place-items-center overflow-hidden border-2 rounded-[4px] [&>*]:w-full [&>*]:h-full [&>*]:object-cover"
                          style={{borderColor}}>
                        <Flag iso={n.iso}/>
                    </span>
                    <div className="flex flex-col gap-[6px] min-w-0">
                        <b className="font-display font-semibold text-[18px] tracking-[0.5px]">{n.name}</b>
                        <div className="flex items-center gap-[8px] flex-wrap">
                            <span className={cn("inline-block px-[10px] py-[3px] font-mono text-[10px] tracking-[0.5px] border border-line rounded-full text-dim whitespace-nowrap", seatCls)}>{seatLabel}</span>
                            {commander && !isMe && <span className="text-[12px] text-dim">{commander}</span>}
                            <span className={cn("font-mono text-[11px]", standing.tone)}>{standing.label}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-[10px]">
                    <StatCell label="Cities" value={eliminated || neutral ? "—" : cities}/>
                    <StatCell label="Forces" value={eliminated || neutral ? "—" : forces}/>
                    <StatCell label="Population" value={eliminated || neutral ? "—" : fmtPop(pop)}/>
                    <StatCell label="GDP" value={eliminated || neutral ? "—" : fmtGdp(gdp, 1)}/>
                </div>

                <div className="flex flex-col gap-[8px]">
                    <span className="font-mono text-[9px] tracking-[1.2px] uppercase text-faint">Diplomacy</span>
                    {!canAct ? (
                        <p className="font-mono text-[11.5px] text-dim">
                            {isMe ? "This is your own power — nothing to negotiate."
                                : neutral ? "A passive neutral country. It stays out of the war for the whole match."
                                    : "This power has been eliminated. Its dossier is preserved for the record."}
                        </p>
                    ) : rel === "war" ? (
                        <div className="flex flex-wrap gap-[8px]">
                            {online ? (
                                <span className="font-mono text-[11px] text-faint">Peace terms are single-player only for now.</span>
                            ) : (
                                <button className={miniButton()} aria-label={`Offer white peace to ${n.name}`}
                                        onClick={() => call(() => api.offerPeace(n.slot))}>Offer Peace</button>
                            )}
                        </div>
                    ) : rel === "ally" ? (
                        <div className="flex flex-wrap gap-[8px]">
                            {online ? (
                                <span className="font-mono text-[11px] text-faint">Alliance terms are single-player only for now.</span>
                            ) : (
                                <button className={miniButton({danger: true})} aria-label={`Break the alliance with ${n.name}`}
                                        onClick={() => call(() => api.breakAlliance(n.slot))}>Break Alliance</button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-[8px]">
                            {!online && (
                                <button className={miniButton()} aria-label={`Propose an alliance to ${n.name}`}
                                        onClick={() => call(() => api.proposeAlliance(n.slot))}>Propose Alliance</button>
                            )}
                            <button className={miniButton({danger: true})} aria-label={`Declare war on ${n.name}`}
                                    disabled={graceActive}
                                    title={graceActive ? "Opening grace — no wars can be declared yet." : undefined}
                                    onClick={() => call(() => api.declareWar(n.slot))}>Declare War</button>
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <button className={miniButton()} onClick={onClose}>Close</button>
                </div>
            </div>
        </ScreenFrame>
    );
}

function StatCell({label, value}) {
    return (
        <div className="flex flex-col gap-[3px] px-[14px] py-3 bg-sunk border border-line rounded">
            <span className="text-[9px] tracking-[1.2px] uppercase text-faint">{label}</span>
            <b className="font-mono text-lg">{value}</b>
        </div>
    );
}
