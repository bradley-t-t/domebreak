// Research tree as a pannable/zoomable atlas — five doctrine tracks laid out on
// a canvas larger than its frame. Drag to pan, wheel to zoom (both clamped to
// bounds, map-style); click an unlocked tech to queue it, click a queued tech to
// pull it back out. Presentation only: all state still flows through the engine
// via api.research / api.unqueue.
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {canQueue, TECH_PATHS, TECHS, UNIT_ICON, UNITS, unitLabel} from "../../game/engine.js";
// ERAS is pure tech-tree metadata (era name / tier range / band color), imported
// straight from the constants module alongside the rest of the tech-tree data.
import {ERAS} from "../../game/data/constants.js";
import UnitIcon from "../common/UnitIcon.jsx";
import {useModal} from "../hooks/useModal.js";
import {cn} from "../lib/cn.js";
import {iconButton} from "../lib/variants.js";

const TIERS = Math.max(...Object.values(TECHS).map((t) => t.tier));
const PATHS = TECH_PATHS.length;

// Canvas geometry (world-space px, pre-zoom). Deterministic so pan bounds need
// no DOM measurement of the canvas — only of the viewport frame.
const PAD = 46;
const LANE_W = 150;   // left gutter for doctrine labels
const NODE_W = 196;
const NODE_H = 130;   // card min-height (also the horizontal wire-bus anchor)
// The tallest card (2-line name + 2-line brief + full spec sheet + payload,
// e.g. a locked "Early-Warning Satellite (DSP)") measures ~190px. ROW must
// clear that so no card can ever overlap the doctrine row beneath it, and the
// canvas must reserve NODE_H_MAX for the bottom row so tall cards aren't
// clipped by the pan bounds.
const NODE_H_MAX = 196;
const COL = 312;      // horizontal step between tiers (wide enough to overflow the frame → drag to explore)
const ROW = 212;      // vertical step between doctrine rows (NODE_H_MAX + gutter)

const nodeX = (tier) => PAD + LANE_W + tier * COL;          // tier: 0-based
const nodeY = (row) => BAND_H + PAD + row * ROW;            // row: 0-based (below the era band)
// The era band header sits above the top lane; the tinted era zones run its full
// height. BAND_H reserves vertical room at the top for the era header row.
const BAND_H = 56;
const CANVAS_W = PAD + LANE_W + (TIERS - 1) * COL + NODE_W + PAD;
const CANVAS_H = BAND_H + PAD + (PATHS - 1) * ROW + NODE_H_MAX + PAD;

// Left/right world-space x of an era zone from its inclusive 1-based tier range.
// Columns are laid out on 0-based indices (tier-1), so tiers [lo,hi] cover the
// span from the left edge of column lo-1 to the right edge of column hi-1. The
// zone is padded slightly outward so nodes sit comfortably inside their band.
const eraLeft = (lo) => nodeX(lo - 1) - (COL - NODE_W) / 2;
const eraRight = (hi) => nodeX(hi - 1) + NODE_W + (COL - NODE_W) / 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Clamp a proposed camera so the canvas can't be dragged out of the frame:
// if the scaled canvas is smaller than the frame on an axis it locks centered,
// otherwise it pins to the edges. Mirrors MapLibre's maxBounds behavior.
function clampCam(x, y, k, vw, vh) {
    const sw = CANVAS_W * k;
    const sh = CANVAS_H * k;
    const cx = sw <= vw ? (vw - sw) / 2 : clamp(x, vw - sw, 0);
    const cy = sh <= vh ? (vh - sh) / 2 : clamp(y, vh - sh, 0);
    return {x: cx, y: cy};
}

// State literal kept on .gd-tt-node so the CSS drafting layer (index.css @layer
// vfx) can theme each state, plus the hover/active micro-motion for available
// nodes expressed as self-referencing arbitrary variants off the same literal.
const NODE_STATE_CLS = {
    done: "done",
    cur: "cur",
    queued: "queued",
    avail: "avail [&.avail:hover]:-translate-y-px [&.avail:active]:scale-[0.99]",
    availPoor: "avail poor [&.avail:hover]:-translate-y-px [&.avail:active]:scale-[0.99]",
    locked: "locked",
};

// A spec-sheet row: label ···· value, with a dotted engineering leader between
// them (the drafting device that makes a blueprint read as a blueprint).
function SpecRow({label, value, muted}) {
    return (
        <span className="relative flex items-center gap-1.5 font-mono text-[9px] leading-[1.5]">
            <span className="text-faint tracking-[1px]">{label}</span>
            <span className="gd-tt-leader flex-1 self-center" aria-hidden="true"/>
            <span className={cn("tabular-nums whitespace-nowrap overflow-hidden text-ellipsis",
                muted ? "text-faint max-w-[104px]" : "text-dim")}>{value}</span>
        </span>
    );
}

// Blueprint / schematic tech node — a drafting card: hairline frame with corner
// ticks, a designation code (OFF-03), a stamped status, a mono spec sheet with
// dotted leaders, and a schematically-framed payload icon for unit unlocks.
function Node({id, tech, nation, api, style}) {
    const rr = nation?.research || {queue: [], done: [], current: null};
    const done = rr.done.includes(id);
    const isCur = rr.current?.id === id;
    const qi = rr.queue.indexOf(id);
    const avail = !done && !isCur && qi < 0 && canQueue(nation, id);
    const locked = !done && !isCur && qi < 0 && !avail;
    const poor = avail && (nation?.points ?? 0) < tech.cost;
    const pct = Math.floor((rr.current?.progress ?? 0) * 100);
    const stateCls = done ? NODE_STATE_CLS.done
        : isCur ? NODE_STATE_CLS.cur
            : qi >= 0 ? NODE_STATE_CLS.queued
                : avail ? (poor ? NODE_STATE_CLS.availPoor : NODE_STATE_CLS.avail)
                    : NODE_STATE_CLS.locked;
    // Drafting designation, e.g. "OFF-03" — track code + zero-padded tier.
    const code = `${tech.path.toUpperCase()}-${String(tech.tier).padStart(2, "0")}`;
    const glyph = TECH_PATHS.find((p) => p.id === tech.path)?.glyph;
    // Stamped status label sitting in the card header.
    const stamp = done ? "FIELDED" : isCur ? `PLOTTING ${pct}%`
        : qi >= 0 ? `QUEUED ${qi + 1}` : poor ? "LOW ◆" : avail ? "READY" : "LOCKED";
    // Techs with `unlocks` grant a new buildable unit on completion — the payload.
    const unlockType = tech.unlocks;
    const unlockName = unlockType ? unitLabel(unlockType) : null;
    const reqName = tech.req ? TECHS[tech.req]?.name : null;
    // Full spoken description for screen readers: name → state → cost/time → payoff.
    const state = done ? "Done"
        : isCur ? `In Progress ${pct}%`
            : qi >= 0 ? `Queued #${qi + 1}`
                : avail ? (poor ? `Available — insufficient points (need ${tech.cost})` : "Available")
                    : "Locked";
    const ariaLabel = [
        `${tech.name}.`, `${state}.`,
        (!done && !isCur) ? `Costs ${tech.cost} points, ${tech.time} seconds.` : null,
        (locked && reqName) ? `Requires ${reqName}.` : null,
        unlockName ? `Unlocks ${unlockName}.` : null,
    ].filter(Boolean).join(" ");
    const onClick = () => {
        if (avail && !poor) api.research(id);
        else if (qi >= 0) api.unqueue(id);
    };
    return (
        <button className={cn(
            "gd-tt-node relative overflow-hidden w-[196px] flex-none flex flex-col text-left",
            "px-[13px] pt-[9px] pb-[11px] rounded-[3px] text-text bg-sunk",
            "transition-[transform,box-shadow] duration-150 ease-out-gd",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2",
            stateCls,
        )}
                style={style} onClick={onClick}
                disabled={locked || done || isCur || (poor && avail)}
                aria-label={ariaLabel}
                title={locked ? "Requires the previous tech." : poor ? `Need ◆ ${tech.cost}` : tech.desc}>
            {/* schematic plot-fill for the tech under active research */}
            {isCur &&
                <i className="gd-tt-fill absolute inset-y-0 left-0 right-auto pointer-events-none"
                   style={{width: `${Math.min(100, pct)}%`}} aria-hidden="true"/>}
            {/* drafting frame — hairline border + corner tick marks */}
            <span className="gd-tt-frame absolute inset-0 pointer-events-none" aria-hidden="true"/>

            {/* header: designation code + stamped status */}
            <span className="relative flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[1.4px] text-faint whitespace-nowrap">
                    <span aria-hidden="true">{glyph}</span> {code}
                </span>
                <span className="gd-tt-stamp flex-none font-mono text-[8px] tracking-[1.3px] whitespace-nowrap px-[5px] py-[1.5px]"
                      aria-hidden="true">{stamp}</span>
            </span>

            {/* tech name + one-line brief */}
            <span className="relative font-display font-bold text-[12.5px] leading-[1.14] mt-[6px]">{tech.name}</span>
            <span className="relative text-[9.5px] text-dim leading-[1.3] mt-[2px] line-clamp-2">{tech.desc}</span>

            {/* spec sheet */}
            <span className="gd-tt-rule relative block mt-[6px] mb-[4px]" aria-hidden="true"/>
            <SpecRow label="COST" value={`◆ ${tech.cost}`}/>
            <SpecRow label="TIME" value={`${tech.time}s`}/>
            {(locked || avail) && reqName && <SpecRow label="REQ" value={reqName} muted/>}

            {/* payload — the unit this tech puts in the field */}
            {unlockType && (
                <span className="gd-tt-payload relative flex items-center gap-2 mt-[7px] pt-[7px]"
                      title={`Unlocks: ${unlockName}`}>
                    <span className="gd-tt-payload-icon flex-none grid place-items-center w-[26px] h-[26px]">
                        <UnitIcon name={UNIT_ICON[unlockType]} size={21}/>
                    </span>
                    <span className="flex flex-col gap-px overflow-hidden">
                        <span className="font-mono text-[7.5px] tracking-[1.8px] uppercase text-faint leading-none">Payload</span>
                        <span className="font-display font-semibold text-[11px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {unlockName}
                        </span>
                    </span>
                </span>
            )}
        </button>
    );
}

export default function TechTree({world, api, mySlot, onClose}) {
    const nation = world.nations.find((n) => n.slot === mySlot);
    const rr = nation?.research || {queue: [], done: [], current: null};

    // Modal a11y contract: focus trap + Escape-to-close + focus restore. Attached
    // to the outer .gd-techtree container (which carries tabIndex={-1}).
    const modalRef = useModal(onClose);

    const viewRef = useRef(null);
    const camRef = useRef({x: 0, y: 0, k: 1});
    const dragRef = useRef(null);
    const [cam, setCam] = useState({x: 0, y: 0, k: 1});
    const [eased, setEased] = useState(false);
    // The research dock is shown by default so the current project + queue are
    // always visible inside the tree; the header button collapses it for a clear
    // view of the atlas.
    const [queueOpen, setQueueOpen] = useState(true);

    const viewSize = () => {
        const el = viewRef.current;
        return {vw: el?.clientWidth ?? 800, vh: el?.clientHeight ?? 500};
    };
    const minK = () => {
        const {vw, vh} = viewSize();
        return Math.min(vw / CANVAS_W, vh / CANVAS_H) * 0.9;
    };
    const maxK = () => Math.max(minK() * 3.2, 1.5);

    const apply = useCallback((next, animate) => {
        const {vw, vh} = viewSize();
        const k = clamp(next.k, minK(), maxK());
        const {x, y} = clampCam(next.x, next.y, k, vw, vh);
        const cam2 = {x, y, k};
        camRef.current = cam2;
        setEased(!!animate);
        setCam(cam2);
    }, []);

    // Fit: pull back to show every doctrine row at once (the ⤢ button).
    const fit = useCallback((animate) => {
        const {vh} = viewSize();
        const k = clamp((vh / CANVAS_H) * 0.98, minK(), maxK());
        apply({x: 0, y: 0, k}, animate);
    }, [apply]);

    // Home: the default view — nodes at readable size with the tree deliberately
    // overflowing the frame, anchored on tier 1, so dragging pans across it.
    const home = useCallback((animate) => {
        const k = clamp(1, minK(), maxK());
        apply({x: 0, y: 0, k}, animate);
    }, [apply]);

    // Initial view + refit on frame resize.
    useLayoutEffect(() => {
        home(false);
        const el = viewRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => apply(camRef.current, false));
        ro.observe(el);
        return () => ro.disconnect();
    }, [home, apply]);

    // Wheel zoom about the cursor (native listener so we can preventDefault).
    useEffect(() => {
        const el = viewRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const cur = camRef.current;
            const nk = clamp(cur.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12), minK(), maxK());
            const r = nk / cur.k;
            apply({x: px - (px - cur.x) * r, y: py - (py - cur.y) * r, k: nk}, false);
        };
        el.addEventListener("wheel", onWheel, {passive: false});
        return () => el.removeEventListener("wheel", onWheel);
    }, [apply]);

    // Drag to pan — only when the press lands on empty canvas, so node clicks
    // still register. A small movement threshold keeps taps from being pans.
    const onPointerDown = (e) => {
        if (e.button !== 0 || e.target.closest(".gd-tt-node")) return;
        const cur = camRef.current;
        dragRef.current = {sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, moved: false};
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        apply({x: d.ox + dx, y: d.oy + dy, k: camRef.current.k}, false);
    };
    const onPointerUp = (e) => {
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
    };

    const zoomBy = (f) => {
        const {vw, vh} = viewSize();
        const cur = camRef.current;
        const nk = clamp(cur.k * f, minK(), maxK());
        const r = nk / cur.k;
        apply({x: vw / 2 - (vw / 2 - cur.x) * r, y: vh / 2 - (vh / 2 - cur.y) * r, k: nk}, true);
    };

    return (
        <div className="gd-techtree absolute inset-0 z-40 flex flex-col bg-[rgba(4,6,9,0.62)] backdrop-blur-[6px] m-[clamp(20px,4vh,56px)_clamp(20px,3.5vw,72px)] [inset:clamp(20px,4vh,56px)_clamp(20px,3.5vw,72px)] border border-line rounded-lg shadow-[0_26px_80px_rgba(0,0,0,0.6)] overflow-hidden animate-[gdRowIn_220ms_var(--ease-out)_both] motion-reduce:animate-none"
             ref={modalRef} tabIndex={-1}
             role="dialog" aria-modal="true" aria-labelledby="gd-tt-title">
            <div className="flex items-center gap-[18px] px-[22px] py-[14px] border-b border-line-soft bg-panel">
                <span className="font-display font-bold text-[15px] tracking-[4px] text-text" id="gd-tt-title">RESEARCH
                    COMMAND</span>
                <span className="font-mono text-[13px] text-gold">◆ {Math.floor(nation?.points ?? 0)}</span>
                {rr.current && <span className="font-mono text-[11px] tracking-[1px] text-dim">
                    {TECHS[rr.current.id].name} · {Math.floor((rr.current.progress ?? 0) * 100)}%
                </span>}
                {(rr.current || rr.queue.length > 0) && (
                    <button className={cn(
                        "font-mono text-[11px] tracking-[1px] text-dim px-[10px] py-1 rounded-sm border border-line bg-btn-bg cursor-pointer transition-[border-color,color] duration-150 ease-out-gd hover:text-text hover:border-line",
                        queueOpen ? "text-text border-gold" : null,
                    )}
                            onClick={() => setQueueOpen((v) => !v)}
                            aria-expanded={queueOpen} aria-controls="gd-tt-queue-panel"
                            title={queueOpen ? "Hide the research queue" : "Show the research queue"}>
                        {queueOpen ? "Hide Queue" : `Queue${rr.queue.length ? ` (${rr.queue.length})` : ""}`}
                    </button>
                )}
                <div className="ml-auto flex gap-1.5" role="group" aria-label="Zoom">
                    <button className={cn(iconButton(), "font-mono text-sm leading-none")} onClick={() => zoomBy(1 / 1.35)}
                            title="Zoom out"
                            aria-label="Zoom out">−
                    </button>
                    <button className={cn(iconButton(), "font-mono text-sm leading-none")} onClick={() => fit(true)}
                            title="Fit tree" aria-label="Fit tree">⤢
                    </button>
                    <button className={cn(iconButton(), "font-mono text-sm leading-none")} onClick={() => zoomBy(1.35)}
                            title="Zoom in" aria-label="Zoom in">+
                    </button>
                </div>
                <button className={cn(iconButton(), "ml-1.5")} onClick={onClose} title="Close (Esc / T)"
                        aria-label="Close">✕
                </button>
            </div>

            <div className="relative flex-1 overflow-hidden cursor-grab touch-none active:cursor-grabbing bg-[radial-gradient(120%_120%_at_50%_0%,rgba(255,255,255,0.03),transparent_60%),repeating-linear-gradient(0deg,var(--hair)_0_1px,transparent_1px_40px),repeating-linear-gradient(90deg,var(--hair)_0_1px,transparent_1px_40px),var(--sunk)]"
                 ref={viewRef}
                 onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                 onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <div className={cn(
                    "absolute top-0 left-0 origin-top-left will-change-transform",
                    eased ? "eased transition-transform duration-[260ms] ease-out-gd motion-reduce:transition-none" : null,
                )}
                     style={{
                         width: CANVAS_W, height: CANVAS_H,
                         transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`,
                     }}>
                    {/* Era banding — chronological zones (Cold War → Modern →
                        Space Age) tint the tier columns and a header row names
                        each era + its years. Reads left→right as advancing time,
                        harder/more modern the further right you research. */}
                    {ERAS.map((era) => {
                        const left = eraLeft(era.tierRange[0]);
                        const width = eraRight(era.tierRange[1]) - left;
                        return (
                            <div key={era.id} className="gd-tt-era absolute" aria-hidden="true"
                                 style={{left, top: 0, width, bottom: 0, "--era": era.color}}>
                                <div className="absolute top-3 left-0 right-0 flex flex-col items-center gap-0.5 text-center">
                                    <span className="gd-tt-era-name font-display font-bold text-sm tracking-[3px] uppercase">{era.name}</span>
                                    <span className="font-mono text-[10px] tracking-[1.5px] text-faint">{era.years}</span>
                                </div>
                            </div>
                        );
                    })}

                    <svg className="absolute inset-0 pointer-events-none overflow-visible" width={CANVAS_W}
                         height={CANVAS_H}
                         viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
                        {TECH_PATHS.map((path, r) =>
                            Array.from({length: TIERS - 1}, (_, i) => {
                                const from = TECHS[`${path.id}${i + 1}`];
                                const to = TECHS[`${path.id}${i + 2}`];
                                if (!from || !to) return null;
                                const lit = rr.done.includes(`${path.id}${i + 1}`);
                                const y = nodeY(r) + NODE_H / 2;
                                return (
                                    <line key={`${path.id}${i}`}
                                          className={cn(
                                              "gd-tt-wire stroke-line transition-[stroke] duration-300 ease-out-gd motion-reduce:transition-none",
                                              lit ? "lit" : null,
                                          )}
                                          x1={nodeX(i) + NODE_W} y1={y} x2={nodeX(i + 1)} y2={y}/>
                                );
                            }),
                        )}
                    </svg>

                    {TECH_PATHS.map((path, r) => (
                        <div key={`lane-${path.id}`}
                             className="gd-tt-lane absolute flex flex-col justify-center gap-[6px] pointer-events-none"
                             style={{left: PAD, top: nodeY(r), width: LANE_W - 18, height: NODE_H}}>
                            <span className="gd-tt-lane-chip w-[34px] h-[34px] flex-none grid place-items-center text-[17px] text-dim"
                                  aria-hidden="true">{path.glyph}</span>
                            <span className="font-mono text-[9px] tracking-[2px] uppercase text-faint">TRK·{path.id.toUpperCase()}</span>
                            <span className="font-display font-semibold text-[11px] tracking-[1px] uppercase text-dim leading-[1.15]">{path.name}</span>
                        </div>
                    ))}

                    {TECH_PATHS.map((path, r) =>
                        Array.from({length: TIERS}, (_, i) => {
                            const id = `${path.id}${i + 1}`;
                            const tech = TECHS[id];
                            if (!tech) return null;
                            return (
                                <Node key={id} id={id} tech={tech} nation={nation} api={api}
                                      style={{
                                          position: "absolute",
                                          left: nodeX(i),
                                          top: nodeY(r),
                                          width: NODE_W,
                                          minHeight: NODE_H
                                      }}/>
                            );
                        }),
                    )}
                </div>
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_60px_26px_rgba(4,6,9,0.55)]"
                     aria-hidden="true"/>

                {queueOpen && (rr.current || rr.queue.length > 0) && (
                    <div className="absolute top-3.5 right-3.5 z-[3] w-[260px] max-h-[calc(100%-28px)] flex flex-col rounded border border-line bg-panel-solid shadow-[0_8px_28px_rgba(0,0,0,0.45)] overflow-hidden"
                         id="gd-tt-queue-panel"
                         role="region" aria-label="Research queue">
                        <div className="font-mono text-[11px] tracking-[2px] uppercase text-dim px-3 py-2.5 border-b border-line-soft">
                            Research Queue
                        </div>
                        <ul className="gd-scroll list-none m-0 p-1.5 overflow-y-auto flex flex-col gap-1">
                            {rr.current && (() => {
                                const t = TECHS[rr.current.id];
                                if (!t) return null;
                                const glyph = TECH_PATHS.find((p) => p.id === t.path)?.glyph;
                                const pct = Math.floor((rr.current.progress ?? 0) * 100);
                                return (
                                    <li key="__current">
                                        <div className="relative overflow-hidden flex items-center gap-2 w-full px-[9px] py-[7px] rounded-sm border border-gold bg-btn-bg cursor-default"
                                             aria-label={`Now researching ${t.name}, ${pct} percent complete.`}>
                                            <i className="absolute inset-y-0 left-0 right-auto z-0 bg-gold opacity-[0.16] pointer-events-none"
                                               style={{width: `${pct}%`}}
                                               aria-hidden="true"/>
                                            <span className="relative z-[1] font-mono text-[11px] min-w-[22px] text-center text-gold"
                                                  aria-hidden="true">▶</span>
                                            <span className="relative z-[1] text-[13px] text-dim" aria-hidden="true">{glyph}</span>
                                            <span className="relative z-[1] flex-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">{t.name}</span>
                                            <span className="relative z-[1] font-mono text-[11px] text-gold">{pct}%</span>
                                        </div>
                                    </li>
                                );
                            })()}
                            {rr.queue.map((qid, i) => {
                                const t = TECHS[qid];
                                if (!t) return null;
                                const glyph = TECH_PATHS.find((p) => p.id === t.path)?.glyph;
                                return (
                                    <li key={qid}>
                                        <button className="flex items-center gap-2 w-full px-[9px] py-[7px] rounded-sm border border-transparent bg-btn-bg text-text text-left cursor-pointer transition-[border-color,background] duration-150 ease-out-gd hover:border-danger hover:bg-panel"
                                                onClick={() => api.unqueue(qid)}
                                                title={`Remove ${t.name} from the queue`}
                                                aria-label={`Queue position ${i + 1}: ${t.name}, ${t.cost} points. Remove from queue.`}>
                                            <span className="font-mono text-[11px] text-faint min-w-[22px]">#{i + 1}</span>
                                            <span className="text-[13px] text-dim" aria-hidden="true">{glyph}</span>
                                            <span className="flex-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">{t.name}</span>
                                            <span className="font-mono text-[11px] text-gold">◆ {t.cost}</span>
                                        </button>
                                    </li>
                                );
                            })}
                            {!rr.queue.length && (
                                <li className="list-none font-mono text-[10px] tracking-[0.4px] text-faint px-2.5 pt-2 pb-1.5">
                                    Queue a tech to line it up next.
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>

            <div className="px-[22px] py-2.5 border-t border-line-soft font-mono text-[10px] tracking-[1px] text-faint text-center">
                Drag to pan · scroll to zoom · click an unlocked tech to queue it, a queued tech
                to
                cancel · research advances one project at a time
            </div>
        </div>
    );
}
