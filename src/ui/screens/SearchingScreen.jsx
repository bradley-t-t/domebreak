import {useEffect, useRef, useState} from "react";
import {cancelMatch, fetchMyQueue, quickMatch, watchQueue} from "../../account/lobby.js";
import {button, row, menuScreen, menuBg, menuInner, menuTitle} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

const SEARCH_TIMEOUT_S = 40;

// "Searching for commanders..." beat between pressing Play and the matchmaker
// placing the caller in a formed lobby. Owns its own quick_match enrollment
// (mount + Retry) so App only needs to switch screens; purely observes the
// caller's own matchmaking_queue row via Realtime (+ a poll fallback) for the
// status:'matched' transition, per adr-004.
export default function SearchingScreen({onMatched, onCancel, reduceMotion}) {
    const [elapsedS, setElapsedS] = useState(0);
    const [timedOut, setTimedOut] = useState(false);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const matchedRef = useRef(false);
    const startedAtRef = useRef(null);

    const handleQueueRow = (row) => {
        if (matchedRef.current) return;
        if (row?.status === "matched" && row?.lobby_id) {
            matchedRef.current = true;
            onMatched?.(row.lobby_id);
        }
    };

    const enroll = async () => {
        setErr(null);
        setTimedOut(false);
        matchedRef.current = false;
        startedAtRef.current = Date.now();
        setElapsedS(0);
        const r = await quickMatch();
        if (r?.error) setErr(r.error);
    };

    useEffect(() => {
        enroll();
        const unsub = watchQueue(() => fetchMyQueue().then(handleQueueRow));
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Elapsed-time tick + client-side searching timeout (mirrors the GDD's
    // server-offline handling: surface "couldn't find a match" with retry/cancel
    // rather than leaving the player stuck indefinitely).
    useEffect(() => {
        if (timedOut || matchedRef.current) return;
        const t = setInterval(() => {
            if (!startedAtRef.current) return;
            const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
            setElapsedS(s);
            if (s >= SEARCH_TIMEOUT_S && !matchedRef.current) setTimedOut(true);
        }, 1000);
        return () => clearInterval(t);
    }, [timedOut]);

    const doCancel = async () => {
        if (busy) return;
        setBusy(true);
        await cancelMatch();
        setBusy(false);
        onCancel?.();
    };
    const doRetry = async () => {
        if (busy) return;
        setBusy(true);
        await cancelMatch();
        setBusy(false);
        enroll();
    };

    const mm = String(Math.floor(elapsedS / 60)).padStart(1, "0");
    const ss = String(elapsedS % 60).padStart(2, "0");

    return (
        <div className={menuScreen()}>
            <div className={menuBg()}/>
            <div className={cn(menuInner(), "w-[min(420px,94vw)] text-center")}>
                <h1 className={menuTitle({sm: true})}>War Room</h1>
                {!timedOut ? (
                    <>
                        <div className={cn("gd-searching-pulse flex justify-center gap-2.5 my-2.5 mb-[18px]", reduceMotion && "still")} aria-hidden="true">
                            <span className={cn("w-2.5 h-2.5 rounded-full bg-gold", reduceMotion ? "opacity-70" : "[animation:gdPulse_1.2s_var(--ease-in-out)_infinite]")}/>
                            <span className={cn("w-2.5 h-2.5 rounded-full bg-gold [animation-delay:0.2s]", reduceMotion ? "opacity-70" : "[animation:gdPulse_1.2s_var(--ease-in-out)_infinite]")}/>
                            <span className={cn("w-2.5 h-2.5 rounded-full bg-gold [animation-delay:0.4s]", reduceMotion ? "opacity-70" : "[animation:gdPulse_1.2s_var(--ease-in-out)_infinite]")}/>
                        </div>
                        <div role="status" aria-live="polite">
                            <p className="gd-searching-label text-sm text-text m-0">Searching for commanders…</p>
                            <p className="gd-searching-elapsed font-mono text-xl text-dim mt-2 tracking-[2px]" aria-label={`Elapsed time ${mm} minutes ${ss} seconds`}>{mm}:{ss}</p>
                        </div>
                        <div aria-live="assertive">
                            {err && <p className="gd-friends-err text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm py-2 px-3 text-[12.5px] mt-2.5">{err}</p>}
                        </div>
                        <button className={cn(button(), "block mt-4")} disabled={busy} onClick={doCancel}
                                aria-label="Cancel matchmaking search">
                            {busy ? "Cancelling…" : "Cancel"}
                        </button>
                    </>
                ) : (
                    <>
                        <p className="gd-searching-label text-sm text-text m-0" role="status" aria-live="polite">Couldn't find a match — try again.</p>
                        <div className={row()}>
                            <button className={button({variant: "primary"})} disabled={busy} onClick={doRetry}>
                                {busy ? "Retrying…" : "Retry"}
                            </button>
                            <button className={button()} disabled={busy} onClick={doCancel}
                                    aria-label="Cancel matchmaking search">
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
