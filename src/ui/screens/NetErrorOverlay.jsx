import {useState} from "react";
import {menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Full-screen error dialog for the online-match handoff and mid-match connection
// loss. Shows a short human-readable message, a preformatted technical dump, and
// a Copy button so the player can paste the failure into a bug report instead of
// getting silently punted to the main menu. `onRetry` is optional — when set, a
// Retry button appears (used for the initial join failure, where the last
// lobby/matchId is still known).
export default function NetErrorOverlay({title, message, details, onRetry, onDismiss}) {
    const [copied, setCopied] = useState(false);

    const clip = [title, message, details].filter(Boolean).join("\n\n");
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(clip);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback: create a temporary textarea, select-all + execCommand.
            // Rare — Electron/Chromium ship clipboard-api, but a stray permissions
            // denial shouldn't leave the user unable to grab the message.
            try {
                const ta = document.createElement("textarea");
                ta.value = clip;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            } catch { /* give up quietly */ }
        }
    };

    return (
        <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(4,6,9,0.72)] backdrop-blur-[6px] pointer-events-auto"
             role="dialog" aria-modal="true" aria-labelledby="db-neterror-title">
            <div className="w-[min(560px,94vw)] max-h-[86vh] overflow-y-auto grid gap-3 px-7 py-[24px] border border-danger rounded bg-[rgba(20,10,10,0.94)] text-[#ffd7dd] shadow motion-safe:animate-[dbPop_220ms_var(--ease-out)]">
                <div id="db-neterror-title"
                     className="font-display text-danger text-[22px] font-bold tracking-[2px] uppercase text-center">
                    {title}
                </div>
                {message && <p className="text-center text-[13px] text-dim m-0">{message}</p>}
                {details && (
                    <pre className="text-left text-[11px] leading-[1.55] text-faint bg-[rgba(255,255,255,0.04)] border border-line rounded p-3 overflow-auto max-h-[240px] whitespace-pre-wrap font-mono select-text">{details}</pre>
                )}
                <div className="flex gap-2 justify-center flex-wrap mt-2">
                    <button className={menuButton()} onClick={copy} aria-live="polite">
                        {copied ? "Copied" : "Copy Error"}
                    </button>
                    {onRetry && (
                        <button className={cn(menuButton({variant: "primary"}))} onClick={onRetry}>
                            Retry
                        </button>
                    )}
                    <button className={menuButton()} onClick={onDismiss}>Return to Menu</button>
                </div>
            </div>
        </div>
    );
}
