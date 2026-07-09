// The stacked global keydown effects LiveGame owns: Escape's cascade of "close whatever's
// open" handling, the command-screen hotkeys (Production / Diplomacy / Research), the
// controls-reference toggle, game-speed hotkeys, and keyboard zoom. Camera pan (WASD) is
// its own hook (usePanControls); it has enough private state (held-key set, ease-segment
// timer) to stay separate.
import {isTyping, keyToken} from "../../game/platform/keybindings.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {clamp} from "../../lib/math.js";
import {useWindowEvent} from "../../lib/hooks/useWindowEvent.js";

export function useKeyboardControls({
                                         menu, setMenu,
                                         disembarkId, setDisembarkId,
                                         moving, setMoving,
                                         placing, setPlacing,
                                         attackMode, setAttackMode,
                                         panel, setPanel,
                                         playerListOpen, setPlayerListOpen,
                                         onPause,
                                         overlayOpen,
                                         w,
                                         api,
                                         K,
                                         setHelpOpen,
                                         mapRef,
                                     }) {
    useWindowEvent("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (menu) setMenu(null); else if (disembarkId) setDisembarkId(null); else if (moving) setMoving(null);
        else if (placing) setPlacing(null); else if (attackMode) setAttackMode(false);
        // An open command screen (Production / Research / Diplomacy) closes on
        // Escape before Escape falls through to the pause menu; the Tab
        // scoreboard closes ahead of both.
        else if (playerListOpen) setPlayerListOpen(false);
        else if (panel) setPanel(null); else onPause?.();
    });

    // Tab toggles the in-game scoreboard (every active power in the match).
    // Fixed binding — never falls through to browser focus cycling on the map.
    useWindowEvent("keydown", (e) => {
        if (overlayOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        if (e.key !== "Tab") return;
        e.preventDefault();
        setPlayerListOpen((v) => !v);
    });

    // Command-screen hotkeys: toggle the Production and Diplomacy screens
    // open/closed (Escape also closes them). Bindings are configurable in Settings;
    // defaults are E / R.
    useWindowEvent("keydown", (e) => {
        if (overlayOpen || playerListOpen || w.over || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        const code = keyToken(e);
        const target = code === K.production ? "production"
            : code === K.diplomacy ? "diplomacy" : null;
        if (!target) return;
        e.preventDefault();
        setPanel((p) => (p === target ? null : target));
    });

    // Controls reference toggle: "?" or F1 opens/closes the command reference.
    // Fixed keys (not rebindable) — the overlay itself lists every binding.
    useWindowEvent("keydown", (e) => {
        if (overlayOpen || playerListOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        if (e.key === "?" || e.key === "F1") {
            e.preventDefault();
            setHelpOpen((v) => !v);
        }
    });

    // Game speed hotkeys, RTS-style: pause toggle + speed up/down step the speed
    // (bindings configurable in Settings; defaults Space / = / −), and the fixed
    // 1–5 number keys jump straight to a speed level.
    const nearest = () => GAME_SPEEDS.reduce((b, s, i) => (Math.abs(s - w.speed) < Math.abs(GAME_SPEEDS[b] - w.speed) ? i : b), 0);
    const stepTo = (i) => api.setSpeed(GAME_SPEEDS[clamp(i, 0, GAME_SPEEDS.length - 1)]);
    useWindowEvent("keydown", (e) => {
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
    });

    // Keyboard zoom (bindings configurable in Settings; defaults Z / X). MapLibre's
    // own +/- zoom is disabled (WorldMap) so those keys stay reserved for game speed;
    // zoom lives here instead. Key auto-repeat gives smooth continuous zoom on hold.
    useWindowEvent("keydown", (e) => {
        if (overlayOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        const code = keyToken(e);
        const dir = code === K.zoomIn ? 1 : code === K.zoomOut ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const m = mapRef.current;
        if (m) m.zoomTo(m.getZoom() + dir * 0.6, {duration: 160}); // MapLibre clamps to min/maxZoom
    });
}
