// The stacked global keydown effects LiveGame owns: Escape's cascade of
// "close whatever's open" handling, the command-screen hotkeys (Production /
// Diplomacy / Research), the controls-reference toggle, game-speed hotkeys,
// and keyboard zoom. Pulled out of LiveGame.jsx verbatim — same handlers,
// same dependency arrays — so each effect subscribes/unsubscribes exactly
// when it did inline. Camera pan (WASD) is its own hook (usePanControls);
// it has enough private state (held-key set, ease-segment timer) to stay
// separate.
import {useEffect} from "react";
import {isTyping, keyToken} from "../../game/platform/keybindings.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";

export function useKeyboardControls({
                                         menu, setMenu,
                                         disembarkId, setDisembarkId,
                                         moving, setMoving,
                                         placing, setPlacing,
                                         attackMode, setAttackMode,
                                         panel, setPanel,
                                         onPause,
                                         overlayOpen,
                                         w,
                                         api,
                                         K,
                                         setHelpOpen,
                                         mapRef,
                                     }) {
    useEffect(() => {
        const h = (e) => {
            if (e.key !== "Escape") return;
            if (menu) setMenu(null); else if (disembarkId) setDisembarkId(null); else if (moving) setMoving(null);
            else if (placing) setPlacing(null); else if (attackMode) setAttackMode(false);
            // An open command screen (Production / Research / Diplomacy) closes on
            // Escape before Escape falls through to the pause menu.
            else if (panel) setPanel(null); else onPause?.();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [menu, disembarkId, moving, placing, attackMode, panel, onPause]);

    // Command-screen hotkeys: toggle the Production, Diplomacy and Research screens
    // open/closed (Escape also closes them). Bindings are configurable in Settings;
    // defaults are E / R / T.
    useEffect(() => {
        const h = (e) => {
            if (overlayOpen || w.over || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            const code = keyToken(e);
            const target = code === K.production ? "production"
                : code === K.diplomacy ? "diplomacy"
                    : code === K.research ? "research" : null;
            if (!target) return;
            e.preventDefault();
            setPanel((p) => (p === target ? null : target));
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [overlayOpen, w.over, K.production, K.diplomacy, K.research]);

    // Controls reference toggle: "?" or F1 opens/closes the command reference.
    // Fixed keys (not rebindable) — the overlay itself lists every binding.
    useEffect(() => {
        const h = (e) => {
            if (overlayOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            if (e.key === "?" || e.key === "F1") {
                e.preventDefault();
                setHelpOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [overlayOpen]);

    // Game speed hotkeys, RTS-style: pause toggle + speed up/down step the speed
    // (bindings configurable in Settings; defaults Space / = / −), and the fixed
    // 1–5 number keys jump straight to a speed level.
    useEffect(() => {
        const nearest = () => GAME_SPEEDS.reduce((b, s, i) => (Math.abs(s - w.speed) < Math.abs(GAME_SPEEDS[b] - w.speed) ? i : b), 0);
        const stepTo = (i) => api.setSpeed(GAME_SPEEDS[Math.max(0, Math.min(GAME_SPEEDS.length - 1, i))]);
        const h = (e) => {
            if (overlayOpen || w.over || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            const code = keyToken(e);
            const lvl = /^(?:Digit|Numpad)([1-5])$/.exec(code);
            if (code === K.pause) {
                e.preventDefault();
                w.paused ? api.play() : api.pause();
            } else if (code === K.speedUp) {
                e.preventDefault();
                stepTo(nearest() + 1);
            } else if (code === K.speedDown) {
                e.preventDefault();
                stepTo(nearest() - 1);
            } else if (lvl) {
                e.preventDefault();
                stepTo(+lvl[1] - 1);
            }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [overlayOpen, api, w, K.pause, K.speedUp, K.speedDown]);

    // Keyboard zoom (bindings configurable in Settings; defaults Z / X). MapLibre's
    // own +/- zoom is disabled (WorldMap) so those keys stay reserved for game speed;
    // zoom lives here instead. Key auto-repeat gives smooth continuous zoom on hold.
    useEffect(() => {
        const h = (e) => {
            if (overlayOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            const code = keyToken(e);
            const dir = code === K.zoomIn ? 1 : code === K.zoomOut ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            const m = mapRef.current;
            if (m) m.zoomTo(m.getZoom() + dir * 0.6, {duration: 160}); // MapLibre clamps to min/maxZoom
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [overlayOpen, K.zoomIn, K.zoomOut]);
}
