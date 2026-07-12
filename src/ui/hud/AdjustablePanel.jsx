import {useCallback, useEffect, useRef, useState} from "react";
import {Check, Contrast, EyeOff, GripVertical, Maximize2, RotateCcw, SlidersHorizontal} from "lucide-react";
import {HUD_OPACITY_MAX, HUD_OPACITY_MIN, HUD_SCALE_MAX, HUD_SCALE_MIN} from "../../game/platform/hudLayout.js";
import {cn} from "../lib/cn.js";
import {clamp} from "../../lib/math.js";
import {useLatestRef} from "../../lib/hooks/useLatestRef.js";
// Drag distance (px) that spans the full resize range floor→ceiling.
const RESIZE_SENSITIVITY = 320;
// Panels always keep this gap from the screen edge — the whole panel stays fully
// on-screen, and a moved panel snaps flush to whichever edge it lands nearest.
const EDGE_MARGIN = 8;

// Nearest-edge target for a panel rect (in current dx/dy terms): returns the
// dx/dy that pins the panel flush against the closest screen edge while keeping
// the other axis fully on-screen. Keeps panels docked to top/bottom/sides and
// never floating in the middle of the map.
function snapToEdge(left, top, w, h, dx, dy, vw, vh) {
    const M = EDGE_MARGIN;
    const right = left + w, bottom = top + h;
    const dTop = top - M, dBottom = (vh - M) - bottom, dLeft = left - M, dRight = (vw - M) - right;
    const nearest = Math.min(dTop, dBottom, dLeft, dRight);
    if (nearest === dTop) return {dx, dy: dy + (M - top)};
    if (nearest === dBottom) return {dx, dy: dy + ((vh - M) - bottom)};
    if (nearest === dLeft) return {dx: dx + (M - left), dy};
    return {dx: dx + ((vw - M) - right), dy};
}

// Bring a rect fully on-screen along one axis: returns the delta to add to the
// current offset so the panel sits within [M, extent - M]; pins to the leading
// edge when the panel is larger than the viewport.
function onScreenDelta(near, size, extent) {
    const M = EDGE_MARGIN;
    if (size >= extent - 2 * M) return M - near;
    if (near < M) return M - near;
    if (near + size > extent - M) return (extent - M) - (near + size);
    return 0;
}

// Wraps an in-game HUD panel and makes it player-adjustable: a toolbar of drag
// handles for repositioning and resizing, plus an opacity slider, a hide button,
// and a reset. Repositioning keeps the panel fully on-screen and snaps it flush
// to the nearest edge. Purely presentational — every change is reported through
// onChange to the machine-local layout store; this component never touches game
// state. The caller supplies the panel's docked position via `className` and the
// toolbar's horizontal edge via `tabAlign`.
//
// Reachability: the toolbar is opened by CLICKING a small adjust handle that sits
// at the panel edge (revealed on hover, so it stays out of the way during play).
// Once open it is PINNED — it stays put no matter where the pointer goes, so the
// player can travel to the sliders and buttons without it vanishing out from under
// them. It closes on the Done button, an outside click, or Escape. (The old
// pure-hover reveal dismissed itself the instant the pointer left the panel to
// reach the controls, which made the controls effectively unusable.)
export default function AdjustablePanel({
                                            panel,
                                            onChange,
                                            onReset,
                                            origin = "top left",
                                            resizeDir = {x: 1, y: 1},
                                            className,
                                            contentClass,
                                            tabAlign = "left",
                                            clickThrough = false,
                                            label,
                                            children,
                                        }) {
    const rootRef = useRef(null);
    // Toolbar drops below the panel when there isn't room for it above (e.g. the
    // panel is snapped flush to the top edge), so the controls stay on-screen.
    const [below, setBelow] = useState(false);
    // Transient live override applied while a drag/slider interaction is in
    // flight — keeps the motion smooth and defers the persisted commit (and its
    // localStorage write) to pointer-up.
    const [live, setLive] = useState(null);
    // Whether the adjust toolbar is pinned open. Click the handle to open; it then
    // stays regardless of pointer position (that's the whole point) until the Done
    // button, an outside click, or Escape closes it.
    const [open, setOpen] = useState(false);
    // Purely cosmetic: reveal the small adjust handle while the pointer is over the
    // panel, so it doesn't clutter the map during play but is there when wanted.
    const [hovered, setHovered] = useState(false);
    // Latest onChange without making layout effects depend on its identity.
    const onChangeRef = useLatestRef(onChange);

    const openToolbar = useCallback(() => {
        // The toolbar is ~32px tall; if the panel sits nearer the top than that
        // (e.g. snapped flush to the top edge) there's no room above, so flip it
        // underneath. The default docks (top-40) keep it above.
        const r = rootRef.current?.getBoundingClientRect();
        if (r) setBelow(r.top < 44);
        setOpen(true);
    }, []);

    // A pinned toolbar must always be dismissible, so it never traps the pointer:
    // any pointerdown outside the panel, or Escape, closes it.
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (!rootRef.current?.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("pointerdown", onDown, true);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const commit = useCallback((patch) => {
        setLive(null);
        onChange(patch);
    }, [onChange]);

    // Grab-to-move: translate the panel, clamped fully on-screen the whole time,
    // then snapped flush to the nearest edge on release.
    const startMove = useCallback((e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const baseDx = panel.dx, baseDy = panel.dy;
        const rect = rootRef.current.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = rect.width, h = rect.height;
        // The panel's screen edge at a given offset is startEdge + (offset - base);
        // invert onScreenDelta back into an offset so it stays fully in view.
        const clampAxis = (offset, base, startEdge, size, extent) =>
            offset + onScreenDelta(startEdge + (offset - base), size, extent);
        let latest = {dx: baseDx, dy: baseDy};
        const move = (ev) => {
            const dx = clampAxis(baseDx + (ev.clientX - startX), baseDx, rect.left, w, vw);
            const dy = clampAxis(baseDy + (ev.clientY - startY), baseDy, rect.top, h, vh);
            latest = {dx, dy};
            setLive(latest);
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            const left = rect.left + (latest.dx - baseDx);
            const top = rect.top + (latest.dy - baseDy);
            commit(snapToEdge(left, top, w, h, latest.dx, latest.dy, vw, vh));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }, [panel.dx, panel.dy, commit]);

    // Grab-to-resize: project pointer travel onto the region's outward axis so
    // dragging away from its anchor grows it, toward it shrinks it.
    const startResize = useCallback((e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const baseScale = panel.scale;
        let latest = baseScale;
        const move = (ev) => {
            const proj = (ev.clientX - startX) * resizeDir.x + (ev.clientY - startY) * resizeDir.y;
            latest = clamp(baseScale + proj / RESIZE_SENSITIVITY, HUD_SCALE_MIN, HUD_SCALE_MAX);
            setLive({scale: latest});
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            commit({scale: latest}); // the on-screen effect below re-clamps after the grow/shrink
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }, [panel.scale, resizeDir.x, resizeDir.y, commit]);

    // Keep the panel fully on-screen after a resize and on any window resize —
    // a bigger panel or a smaller window can push it past an edge. Runs on mount
    // too, so a layout saved on a larger display still lands on-screen here.
    useEffect(() => {
        const clampIn = () => {
            const el = rootRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const ax = onScreenDelta(r.left, r.width, window.innerWidth);
            const ay = onScreenDelta(r.top, r.height, window.innerHeight);
            if (Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5) {
                onChangeRef.current({dx: panel.dx + ax, dy: panel.dy + ay});
            }
        };
        clampIn();
        window.addEventListener("resize", clampIn);
        return () => window.removeEventListener("resize", clampIn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panel.scale]);

    if (panel.hidden) return null;

    const eff = live ? {...panel, ...live} : panel;
    const visible = open || !!live;
    const gripBtn = "w-6 h-6 grid place-items-center rounded text-dim hover:text-text hover:bg-[rgba(160,168,178,0.12)] transition-colors";
    const alignJustify = tabAlign === "center" ? "justify-center" : tabAlign === "right" ? "justify-end" : "justify-start";
    // Drop below the panel only when there's no room above; the small offset (pt/pb)
    // floats the handle/toolbar just off the panel edge.
    const vertCls = below ? "top-full pt-1.5" : "bottom-full pb-1.5";

    return (
        <div
            ref={rootRef}
            className={className}
            // pointerover/out (which bubble) rather than enter/leave, so hover is
            // detected even on click-through wrappers whose root has
            // pointer-events:none — the event still bubbles up from the interactive
            // children. A move that stays within the panel (relatedTarget inside)
            // keeps the handle revealed.
            onPointerOver={() => setHovered(true)}
            onPointerOut={(e) => {
                if (!(e.relatedTarget instanceof Node) || !rootRef.current?.contains(e.relatedTarget)) setHovered(false);
            }}
            onFocusCapture={() => setHovered(true)}
            onBlurCapture={(e) => {
                if (!(e.relatedTarget instanceof Node) || !rootRef.current?.contains(e.relatedTarget)) setHovered(false);
            }}
            style={{
                transform: `translate(${eff.dx}px, ${eff.dy}px) scale(${eff.scale})`,
                transformOrigin: origin,
                // Full-width wrappers (the top bar) must not blanket the map with a
                // click-blocker; the panel content, handle, and toolbar re-enable
                // pointer events on themselves, so only they stay interactive.
                ...(clickThrough ? {pointerEvents: "none"} : null),
            }}>
            {/* Opacity is scoped to the content, never the controls, so a faded panel
                still has a fully legible toolbar when adjusting. */}
            <div className={contentClass} style={{opacity: eff.opacity}}>{children}</div>
            {/* Adjust affordance — a strip pinned to the panel edge, aligned to the
                given side. The strip itself is click-through; only the handle/toolbar
                inside it capture the pointer, so empty space never blocks the map. */}
            <div className={cn("absolute left-0 right-0 z-30 flex pointer-events-none", alignJustify, vertCls)}>
                {visible ? (
                    <div
                        className="pointer-events-auto flex items-center gap-1 rounded-md bg-panel-2 border border-line px-1.5 py-1 shadow backdrop-blur-[10px] select-none motion-safe:animate-[dbPop_120ms_var(--ease-out)]"
                        role="toolbar"
                        aria-label={`${label} layout controls`}>
                        <button type="button" className={cn(gripBtn, "cursor-grab active:cursor-grabbing touch-none")}
                                onPointerDown={startMove} title="Drag to move" aria-label={`Move ${label}`}>
                            <GripVertical size={14} aria-hidden="true"/>
                        </button>
                        <button type="button" className={cn(gripBtn, "cursor-nwse-resize touch-none")}
                                onPointerDown={startResize} title="Drag to resize" aria-label={`Resize ${label}`}>
                            <Maximize2 size={13} aria-hidden="true"/>
                        </button>
                        <label className="flex items-center gap-1 px-1" title="Opacity"
                               onPointerDown={(e) => e.stopPropagation()}>
                            <Contrast size={13} className="text-dim" aria-hidden="true"/>
                            <input type="range" min={HUD_OPACITY_MIN} max={HUD_OPACITY_MAX} step={0.05}
                                   value={eff.opacity} className="w-14 accent-gold cursor-pointer"
                                   aria-label={`${label} opacity`}
                                   onInput={(e) => setLive({opacity: Number(e.target.value)})}
                                   onChange={(e) => commit({opacity: Number(e.target.value)})}/>
                        </label>
                        <button type="button" className={gripBtn} onClick={() => onReset?.()}
                                title="Reset this panel" aria-label={`Reset ${label}`}>
                            <RotateCcw size={13} aria-hidden="true"/>
                        </button>
                        <button type="button" className={gripBtn} onClick={() => onChange({hidden: true})}
                                title="Hide this panel" aria-label={`Hide ${label}`}>
                            <EyeOff size={13} aria-hidden="true"/>
                        </button>
                        <div className="w-px self-stretch bg-line mx-0.5" aria-hidden="true"/>
                        <button type="button" className={cn(gripBtn, "text-gold hover:text-gold")}
                                onClick={() => setOpen(false)} title="Done" aria-label={`Done adjusting ${label}`}>
                            <Check size={14} aria-hidden="true"/>
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className={cn(
                            "pointer-events-auto flex items-center gap-1 h-[19px] px-1.5 rounded bg-panel-2/95 border border-line shadow backdrop-blur-[10px] text-dim hover:text-text hover:border-blue transition-[opacity,color,border-color] duration-150",
                            hovered ? "opacity-100" : "opacity-0 focus-visible:opacity-100",
                        )}
                        onClick={openToolbar}
                        aria-label={`Adjust ${label} — move, resize, fade, or hide`}
                        title={`Adjust ${label} — move, resize, fade, or hide`}>
                        <SlidersHorizontal size={12} aria-hidden="true"/>
                        <span className="font-display text-[8.5px] tracking-[1.2px] uppercase leading-none">Adjust</span>
                    </button>
                )}
            </div>
        </div>
    );
}
