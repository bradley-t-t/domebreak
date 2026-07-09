import {useCallback, useEffect, useRef, useState} from "react";

// Manages a list of short-lived items (explosions, flashes) that expire
// after `ttlMs`. Tracks per-id timers so unmount cancels every pending
// removal and duplicate ids don't leak stray filter calls after the list is
// gone.
export function useTransientList(ttlMs) {
    const [items, setItems] = useState([]);
    const timers = useRef(new Map());
    const push = useCallback((fresh) => {
        if (!fresh || fresh.length === 0) return;
        setItems((list) => [...list, ...fresh]);
        for (const item of fresh) {
            const id = item.id;
            const handle = setTimeout(() => {
                timers.current.delete(id);
                setItems((list) => list.filter((x) => x.id !== id));
            }, ttlMs);
            timers.current.set(id, handle);
        }
    }, [ttlMs]);
    useEffect(() => () => {
        for (const h of timers.current.values()) clearTimeout(h);
        timers.current.clear();
    }, []);
    return [items, push];
}
