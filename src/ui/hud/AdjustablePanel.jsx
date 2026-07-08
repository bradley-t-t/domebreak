import {useCallback, useRef, useState} from "react";
import {Contrast, EyeOff, GripVertical, Maximize2, RotateCcw} from "lucide-react";
import {HUD_OPACITY_MAX, HUD_OPACITY_MIN, HUD_SCALE_MAX, HUD_SCALE_MIN} from "../../game/platform/hudLayout.js";
import {cn} from "../lib/cn.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Drag distance (px) that spans the full resize range floor→ceiling.
const RESIZE_SENSITIVITY = 320;
// Keep at least this many px of a panel on-screen when it's dragged around, so it
// can never be flung fully out of reach.
const KEEP_ON_SCREEN = 44;

// Wraps an in-game HUD panel and makes it player-adjustable: a hover toolbar of
// drag handles for repositioning and resizing, plus an opacity slider, a hide
// button, and a reset. Purely presentational — every change is reported through
// onChange to the machine-local layout store; this component never touches game
// state. The caller supplies the panel's docked position via `className` and the
// toolbar's placement via `tabClass`, since only the caller knows each region's
// geometry.
export default function AdjustablePanel({
                                            panel,
                                            onChange,
                                            onReset,
                                            origin = "top left",
                                            resizeDir = {x: 1, y: 1},
                                            className,
                                            contentClass,
                                            tabClass,
                                            tabOrient = "row",
                                            clickThrough = false,
                                            label,
                                            children,
                                        }) {
    const rootRef = useRef(null);
    // Transient live override applied while a drag/slider interaction is in
    // flight — keeps the motion smooth and defers the persisted commit (and its
    // localStorage write) to pointer-up.
    const [live, setLive] = useState(null);

    const commit = useCallback((patch) => {
        setLive(null);
        onChange(patch);
    }, [onChange]);

    // Grab-to-move: translate the panel, clamped so a sliver always stays visible.
    const startMove = useCallback((e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const baseDx = panel.dx, baseDy = panel.dy;
        const rect = rootRef.current.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        // Bounds expressed directly in dx/dy terms (rect already reflects baseDx/dy).
        const minDx = baseDx + (KEEP_ON_SCREEN - rect.right);
        const maxDx = baseDx + (vw - KEEP_ON_SCREEN - rect.left);
        const minDy = baseDy + (KEEP_ON_SCREEN - rect.bottom);
        const maxDy = baseDy + (vh - KEEP_ON_SCREEN - rect.top);
        let latest = {dx: baseDx, dy: baseDy};
        const move = (ev) => {
            latest = {
                dx: clamp(baseDx + (ev.clientX - startX), minDx, maxDx),
                dy: clamp(baseDy + (ev.clientY - startY), minDy, maxDy),
            };
            setLive(latest);
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            commit(latest);
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
            commit({scale: latest});
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }, [panel.scale, resizeDir.x, resizeDir.y, commit]);

    if (panel.hidden) return null;

    const eff = live ? {...panel, ...live} : panel;
    const gripBtn = "w-6 h-6 grid place-items-center rounded text-dim hover:text-text hover:bg-[rgba(160,168,178,0.12)] transition-colors";

    return (
        <div
            ref={rootRef}
            className={cn("group/adj", className)}
            style={{
                transform: `translate(${eff.dx}px, ${eff.dy}px) scale(${eff.scale})`,
                transformOrigin: origin,
                // Full-width wrappers (the top bar) must not blanket the map with a
                // click-blocker; the panel content and toolbar re-enable pointer
                // events on themselves, so only they stay interactive.
                ...(clickThrough ? {pointerEvents: "none"} : null),
            }}>
            {/* Opacity is scoped to the content, never the toolbar, so a faded panel
                still has fully legible controls when hovered. */}
            <div className={contentClass} style={{opacity: eff.opacity}}>{children}</div>
            {/* Adjustment toolbar — hidden until the panel is hovered (or an
                interaction is live), so it stays out of the way during play. */}
            <div
                className={cn(
                    "absolute z-30 flex items-center gap-1 rounded-md bg-panel-2 border border-line px-1.5 py-1 shadow backdrop-blur-[10px] pointer-events-auto select-none transition-opacity duration-150 opacity-0 group-hover/adj:opacity-100 focus-within:opacity-100",
                    tabOrient === "col" && "flex-col",
                    live && "opacity-100",
                    tabClass,
                )}
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
            </div>
        </div>
    );
}
