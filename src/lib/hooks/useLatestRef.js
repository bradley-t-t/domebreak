import {useRef} from "react";

// Return a ref that always holds the most recent argument value, so long-lived
// effects/callbacks can read live inputs without re-running. Writing during
// render is intentional here — the ref itself is stable, and the update runs
// before any consumer reads it (the react-hooks/refs rule is off for src/**
// per eslint.config.js).
export function useLatestRef(value) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
