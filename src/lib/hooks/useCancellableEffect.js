import {useEffect} from "react";

// Run an effect with a cancellation token that flips on unmount and exposes
// an AbortSignal, so async work can bail out with `if (t.cancelled) return`
// without hand-rolling the `let cancelled = false` flag + cleanup pair.
//
// The effect may return a synchronous cleanup fn (as with a normal useEffect)
// or a Promise. The promise's own return value is ignored — cleanup happens
// via the token.
export function useCancellableEffect(effect, deps) {
    useEffect(() => {
        const controller = new AbortController();
        const token = {cancelled: false, signal: controller.signal};
        const teardown = effect(token);
        return () => {
            token.cancelled = true;
            controller.abort();
            if (typeof teardown === "function") teardown();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
