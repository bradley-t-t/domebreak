import {useEffect, useRef, useState} from "react";
import {cancelMatch, fetchMyQueue, quickMatch, watchQueue} from "../../account/lobby.js";

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
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner gd-searching">
                <h1 className="gd-menu-title sm">War Room</h1>
                {!timedOut ? (
                    <>
                        <div className={`gd-searching-pulse ${reduceMotion ? "still" : ""}`} aria-hidden="true">
                            <span/>
                            <span/>
                            <span/>
                        </div>
                        <div role="status" aria-live="polite">
                            <p className="gd-searching-label">Searching for commanders…</p>
                            <p className="gd-searching-elapsed" aria-label={`Elapsed time ${mm} minutes ${ss} seconds`}>{mm}:{ss}</p>
                        </div>
                        <div aria-live="assertive">
                            {err && <p className="gd-friends-err">{err}</p>}
                        </div>
                        <button className="gd-btn block mt" disabled={busy} onClick={doCancel}
                                aria-label="Cancel matchmaking search">
                            {busy ? "Cancelling…" : "Cancel"}
                        </button>
                    </>
                ) : (
                    <>
                        <p className="gd-searching-label" role="status" aria-live="polite">Couldn't find a match — try again.</p>
                        <div className="gd-row mt">
                            <button className="gd-btn primary" disabled={busy} onClick={doRetry}>
                                {busy ? "Retrying…" : "Retry"}
                            </button>
                            <button className="gd-btn" disabled={busy} onClick={doCancel}
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
