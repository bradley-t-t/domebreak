import {useCallback, useEffect, useRef, useState} from "react";

// A value that auto-nulls itself after a delay. Replaces the setState + bare
// setTimeout(() => setState(null), ms) pairs so successive shows cancel the
// prior timer and unmount stops the scheduled state write.
export function useAutoClear(defaultMs = 2000) {
    const [value, setValue] = useState(null);
    const timer = useRef(0);
    const clearTimer = () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = 0;
        }
    };
    const show = useCallback((v, ms) => {
        clearTimer();
        setValue(v);
        timer.current = setTimeout(() => {
            timer.current = 0;
            setValue(null);
        }, ms ?? defaultMs);
    }, [defaultMs]);
    const clear = useCallback(() => {
        clearTimer();
        setValue(null);
    }, []);
    useEffect(() => () => clearTimer(), []);
    return [value, show, clear];
}
