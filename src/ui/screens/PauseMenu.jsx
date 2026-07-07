import {useModal} from "../hooks/useModal.js";
import {card, menuButton, overlay} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

export default function PauseMenu({onResume, onSave, onLoad, onSettings, onQuit, over}) {
    // Escape resumes while paused; once the game is over there's nothing to resume,
    // so Escape is a no-op (the only way out is a menu button).
    const ref = useModal(over ? undefined : onResume);
    return (
        <div className={overlay({placement: "center"})}>
            <div className={cn(card(), "animate-[gdPop_240ms_var(--ease-out-gd)] motion-reduce:animate-none w-[min(300px,90vw)] text-center")} ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby="db-pausemenu-title">
                <div className="text-[26px] tracking-[3px] mb-4 font-bold uppercase m-0 text-dim" id="db-pausemenu-title">{over ? "Game Over" : "Paused"}</div>
                <div className="flex flex-col gap-2.5 w-full mx-auto">
                    {!over && <button className={menuButton({variant: "primary"})} onClick={onResume}>Resume</button>}
                    {!over && <button className={menuButton()} onClick={onSave}>Save Game</button>}
                    <button className={menuButton()} onClick={onLoad}>Load Game</button>
                    <button className={menuButton()} onClick={onSettings}>Settings</button>
                    <button className={menuButton({variant: "danger"})} onClick={onQuit}>Quit to Menu</button>
                </div>
                {!over &&
                    <div className="mt-3.5 font-mono text-[11px] text-dim tracking-[0.02em]">E — Production · R — Diplomacy · T — Research · Space — Pause · ? —
                        Controls · Esc — Menu · Rebind all in Settings</div>}
            </div>
        </div>
    );
}
