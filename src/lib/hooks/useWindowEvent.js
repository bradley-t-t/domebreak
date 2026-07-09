import {useEffect} from "react";

// Attach one or more window/document event listeners inside an effect and
// auto-remove them on cleanup. Replaces the addEventListener /
// removeEventListener pair that every hotkey and splash-skip site repeats.
//
// The handler is deliberately taken as-is (no ref latching) so callers that
// want a stable handler pass a stable one; the effect re-subscribes when the
// handler identity changes, matching the pre-extraction behaviour.
export function useWindowEvent(type, handler, options = {}) {
    const {capture = false, enabled = true, target = "window"} = options;
    useEffect(() => {
        if (!enabled) return undefined;
        const el = target === "document" ? document : window;
        const types = Array.isArray(type) ? type : [type];
        for (const t of types) el.addEventListener(t, handler, capture);
        return () => {
            for (const t of types) el.removeEventListener(t, handler, capture);
        };
    }, [type, handler, capture, enabled, target]);
}
