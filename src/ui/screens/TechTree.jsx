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

const TIERS = Math.max(...Object.values(TECHS).map((t) => t.tier));
const PATHS = TECH_PATHS.length;

// Canvas geometry (world-space px, pre-zoom). Deterministic so pan bounds need
// no DOM measurement of the canvas — only of the viewport frame.
const PAD = 46;
const LANE_W = 150;   // left gutter for doctrine labels
const NODE_W = 196;
const NODE_H = 120;
const COL = 312;      // horizontal step between tiers (wide enough to overflow the frame → drag to explore)
const ROW = 178;      // vertical step between doctrine rows

// Era accent color for a tier (nodes carry a thin era-tinted spine so the
// chronological bands read on each node, not just the background zones).
const eraColorForTier = (tier) =>
    (ERAS.find((e) => tier >= e.tierRange[0] && tier <= e.tierRange[1]) || {}).color || "var(--line)";

const nodeX = (tier) => PAD + LANE_W + tier * COL;          // tier: 0-based
const nodeY = (row) => BAND_H + PAD + row * ROW;            // row: 0-based (below the era band)
// The era band header sits above the top lane; the tinted era zones run its full
// height. BAND_H reserves vertical room at the top for the era header row.
const BAND_H = 56;
const CANVAS_W = PAD + LANE_W + (TIERS - 1) * COL + NODE_W + PAD;
const CANVAS_H = BAND_H + PAD + (PATHS - 1) * ROW + NODE_H + PAD;

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

function Node({id, tech, nation, api, style, eraColor}) {
    const rr = nation?.research || {queue: [], done: [], current: null};
    const done = rr.done.includes(id);
    const isCur = rr.current?.id === id;
    const qi = rr.queue.indexOf(id);
    const avail = !done && !isCur && qi < 0 && canQueue(nation, id);
    const locked = !done && !isCur && qi < 0 && !avail;
    const poor = avail && (nation?.points ?? 0) < tech.cost;
    const cls = done ? "done" : isCur ? "cur" : qi >= 0 ? "queued" : avail ? (poor ? "avail poor" : "avail") : "locked";
    // Techs with `unlocks` grant a new buildable unit on completion — surface it
    // as a badge so players can read the arsenal payoff straight off the node.
    const unlockType = tech.unlocks;
    const unlockName = unlockType ? unitLabel(unlockType) : null;
    const onClick = () => {
        if (avail && !poor) api.research(id);
        else if (qi >= 0) api.unqueue(id);
    };
    return (
        <button className={`gd-tt-node ${cls} ${unlockType ? "has-unlock" : ""}`}
                style={{...style, "--era": eraColor}} onClick={onClick}
                disabled={locked || done || isCur || poor && avail}
                title={locked ? "Requires the previous tech." : poor ? `Need ◆ ${tech.cost}` : tech.desc}>
            {isCur &&
                <i className="gd-tt-fill" style={{width: `${Math.min(100, (rr.current?.progress ?? 0) * 100)}%`}}/>}
            <span className="gd-tt-accent" aria-hidden="true"/>
            <span className="gd-tt-node-top">
                <span className="gd-tt-name">{tech.name}</span>
                {done && <span className="gd-tt-check" aria-hidden="true">✓</span>}
            </span>
            <span className="gd-tt-desc">{tech.desc}</span>
            <span className="gd-tt-meta">
                {done ? "✓ Fielded" : isCur ? `${Math.floor((rr.current?.progress ?? 0) * 100)}%`
                    : qi >= 0 ? `#${qi + 1} in queue` : `◆ ${tech.cost} · ${tech.time}s`}
            </span>
            {unlockType && (
                <span className="gd-tt-unlock" title={`Unlocks: ${unlockName}`}>
                    <span className="gd-tt-unlock-medal">
                        <UnitIcon name={UNIT_ICON[unlockType]} size={26}/>
                    </span>
                    <span className="gd-tt-unlock-text">
                        <span className="gd-tt-unlock-kicker">Unlocks</span>
                        <span className="gd-tt-unlock-label">{unlockName}</span>
                    </span>
                </span>
            )}
        </button>
    );
}

export default function TechTree({world, api, mySlot, onClose}) {
    const nation = world.nations.find((n) => n.slot === mySlot);
    const rr = nation?.research || {queue: [], done: [], current: null};

    const viewRef = useRef(null);
    const camRef = useRef({x: 0, y: 0, k: 1});
    const dragRef = useRef(null);
    const [cam, setCam] = useState({x: 0, y: 0, k: 1});
    const [eased, setEased] = useState(false);

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

    useEffect(() => {
        const h = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

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
        <div className="gd-techtree" role="dialog" aria-label="Research tree">
            <div className="gd-tt-head">
                <span className="gd-tt-title">RESEARCH COMMAND</span>
                <span className="gd-tt-points">◆ {Math.floor(nation?.points ?? 0)}</span>
                {rr.current && <span className="gd-tt-current">
                    {TECHS[rr.current.id].name} · {Math.floor((rr.current.progress ?? 0) * 100)}%
                </span>}
                {rr.queue.length > 0 && <span className="gd-tt-queue">{rr.queue.length} queued</span>}
                <div className="gd-tt-zoom" role="group" aria-label="Zoom">
                    <button className="gd-iconbtn" onClick={() => zoomBy(1 / 1.35)} title="Zoom out"
                            aria-label="Zoom out">−
                    </button>
                    <button className="gd-iconbtn" onClick={() => fit(true)} title="Fit tree" aria-label="Fit tree">⤢
                    </button>
                    <button className="gd-iconbtn" onClick={() => zoomBy(1.35)} title="Zoom in" aria-label="Zoom in">+
                    </button>
                </div>
                <button className="gd-iconbtn gd-tt-close" onClick={onClose} title="Close (Esc / T)"
                        aria-label="Close">✕
                </button>
            </div>

            <div className="gd-tt-viewport" ref={viewRef}
                 onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                 onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <div className={`gd-tt-canvas ${eased ? "eased" : ""}`}
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
                            <div key={era.id} className="gd-tt-era" aria-hidden="true"
                                 style={{left, top: 0, width, bottom: 0, "--era": era.color}}>
                                <div className="gd-tt-era-head">
                                    <span className="gd-tt-era-name">{era.name}</span>
                                    <span className="gd-tt-era-years">{era.years}</span>
                                </div>
                            </div>
                        );
                    })}

                    <svg className="gd-tt-wires" width={CANVAS_W} height={CANVAS_H}
                         viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
                        {TECH_PATHS.map((path, r) =>
                            Array.from({length: TIERS - 1}, (_, i) => {
                                const from = TECHS[`${path.id}${i + 1}`];
                                const to = TECHS[`${path.id}${i + 2}`];
                                if (!from || !to) return null;
                                const lit = rr.done.includes(`${path.id}${i + 1}`);
                                const y = nodeY(r) + NODE_H / 2;
                                return (
                                    <line key={`${path.id}${i}`} className={`gd-tt-wire ${lit ? "lit" : ""}`}
                                          x1={nodeX(i) + NODE_W} y1={y} x2={nodeX(i + 1)} y2={y}/>
                                );
                            }),
                        )}
                    </svg>

                    {TECH_PATHS.map((path, r) => (
                        <div key={`lane-${path.id}`} className="gd-tt-lane-label"
                             style={{left: PAD, top: nodeY(r), width: LANE_W - 18, height: NODE_H}}>
                            <span className="gd-arsenal-glyph" data-kind="support">{path.glyph}</span>
                            <span>{path.name}</span>
                        </div>
                    ))}

                    {TECH_PATHS.map((path, r) =>
                        Array.from({length: TIERS}, (_, i) => {
                            const id = `${path.id}${i + 1}`;
                            const tech = TECHS[id];
                            if (!tech) return null;
                            return (
                                <Node key={id} id={id} tech={tech} nation={nation} api={api}
                                      eraColor={eraColorForTier(tech.tier)}
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
                <div className="gd-tt-vignette" aria-hidden="true"/>
            </div>

            <div className="gd-tt-foot">Drag to pan · scroll to zoom · click an unlocked tech to queue it, a queued tech
                to
                cancel · research advances one project at a time
            </div>
        </div>
    );
}
