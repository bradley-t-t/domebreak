import {useCallback, useEffect, useRef, useState} from "react";
import {Contrast, EyeOff, GripVertical, Maximize2, RotateCcw} from "lucide-react";
import {HUD_OPACITY_MAX, HUD_OPACITY_MIN, HUD_SCALE_MAX, HUD_SCALE_MIN} from "../../game/platform/hudLayout.js";
import {cn} from "../lib/cn.js";
import {clamp} from "../../lib/math.js";
import {useLatestRef} from "../../lib/hooks/useLatestRef.js";
// Drag distance (px) that spans the full resize range floor→ceiling.
const RESIZE_SENSITIVITY = 320;
// Panels always keep this gap from the screen edge — the whole panel stays fully
// on-screen, and a moved panel snaps flush to whichever edge it lands nearest.
const EDGE_MARGIN = 8;
// Grace period before the hover toolbar closes, so crossing the small gap from
// the panel to the toolbar (or between its buttons) never dismisses it.
const CLOSE_DELAY = 300;

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

// Wraps an in-game HUD panel and makes it player-adjustable: a hover toolbar of
// drag handles for repositioning and resizing, plus an opacity slider, a hide
// button, and a reset. Repositioning keeps the panel fully on-screen and snaps
// it flush to the nearest edge. Purely presentational — every change is reported
// through onChange to the machine-local layout store; this component never
// touches game state. The caller supplies the panel's docked position via
// `className` and the toolbar's horizontal edge via `tabAlign`.
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
    // Hover-driven toolbar visibility. Tracked in JS (not CSS :hover) so it works
    // through the click-through top bar and survives the trip from panel to
    // toolbar via the close delay.
    const [show, setShow] = useState(false);
    const closeT = useRef(0);
    // Latest onChange without making layout effects depend on its identity.
    const onChangeRef = useLatestRef(onChange);

    const openTab = useCallback(() => {
        clearTimeout(closeT.current);
        // The toolbar is ~32px tall; if the panel sits nearer the top than that
        // (e.g. snapped flush to the top edge) there's no room above, so flip it
        // underneath. The default docks (top-40) keep it above.
        const r = rootRef.current?.getBoundingClientRect();
        if (r) setBelow(r.top < 36);
        setShow(true);
    }, []);
    const scheduleClose = useCallback(() => {
        clearTimeout(closeT.current);
        closeT.current = setTimeout(() => setShow(false), CLOSE_DELAY);
    }, []);
    // pointerout bubbles up from children; ignore moves that stay within the
    // panel/toolbar (relatedTarget still inside), close only on a real exit.
    const onPointerOut = useCallback((e) => {
        const rt = e.relatedTarget;
        if (rt instanceof Node && rootRef.current?.contains(rt)) return;
        scheduleClose();
    }, [scheduleClose]);
    useEffect(() => () => clearTimeout(closeT.current), []);

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
    const visible = show || !!live;
    const gripBtn = "w-6 h-6 grid place-items-center rounded text-dim hover:text-text hover:bg-[rgba(160,168,178,0.12)] transition-colors";
    // The toolbar lives inside a FULL-WIDTH hover strip that spans the panel and
    // sits flush against its edge (with a small transparent bridge). That strip —
    // not just the little pill — is the hover-catch area, so moving the pointer
    // from anywhere on the panel toward the controls never crosses dead space and
    // dismisses them. The visible pill is aligned within the strip to a panel edge.
    const alignJustify = tabAlign === "center" ? "justify-center" : tabAlign === "right" ? "justify-end" : "justify-start";
    // Drop below the panel only when there's no room above; the bridge padding
    // (pt/pb) overlaps the panel edge so the catch strip is continuous with it.
    const vertCls = below ? "top-full pt-1.5" : "bottom-full pb-1.5";

    return (
        <div
            ref={rootRef}
            className={className}
            onPointerOver={openTab}
            onPointerOut={onPointerOut}
            onFocusCapture={openTab}
            onBlurCapture={onPointerOut}
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
            {/* Adjustment toolbar — revealed on hover (or during an interaction), so
                it stays out of the way during play. The outer strip spans the panel
                width and bridges flush to its edge so the pointer can reach the pill
                without crossing dead space; the pill itself carries the controls. */}
            <div
                className={cn(
                    "absolute left-0 right-0 z-30 flex", alignJustify, vertCls,
                    "transition-opacity duration-150",
                    visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                )}>
                <div
                    className="flex items-center gap-1 rounded-md bg-panel-2 border border-line px-1.5 py-1 shadow backdrop-blur-[10px] select-none"
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
        </div>
    );
}
