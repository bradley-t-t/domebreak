import {useEffect, useState} from "react";
import {menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Update prompt: shown when a newer release is published (useUpdateCheck) or
// the server rejected our hello as outdated. Single player stays playable —
// this is dismissible — but multiplayer entry routes here until the client is
// current, mirroring the server's hard version gate.
//
// The CTA depends on how this build runs: the desktop app updates ITSELF —
// Update Now drives the main-process updater (electron/updater.cjs) over the
// preload's window.dbUpdater bridge, which downloads this platform's installer
// and reinstalls in place, narrating download/install/restart here. The
// website download stays available as the manual fallback. A browser client
// is simply served fresh code on reload.
// Hash route — the marketing site is a hash-routed SPA (web/src/hooks/
// useHashRoute.js). The site also 308s the bare /download path here for the
// installers that shipped linking it.
const DOWNLOAD_URL = "https://domebreak.com/#/download";

// ipcRenderer.invoke rejections arrive wrapped ("Error invoking remote method
// 'update:start': Error: <reason>") — surface just the reason.
function updateErrorMessage(e) {
    return String(e?.message || e)
        .split("Error invoking remote method 'update:start': ")
        .pop()
        .replace(/^Error:\s*/, "");
}

const BUSY_LABEL = {
    downloading: (percent) => `Downloading… ${Math.round(percent * 100)}%`,
    installing: () => "Installing…",
    restarting: () => "Restarting…",
};

export default function UpdateOverlay({currentVersion, latestVersion, onDismiss}) {
    const inDesktopApp = typeof window !== "undefined" && !!window.dbLocal;
    const updater = typeof window !== "undefined" ? window.dbUpdater : undefined;
    const [phase, setPhase] = useState("idle");
    const [percent, setPercent] = useState(0);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!updater) return undefined;
        return updater.onProgress((info) => {
            if (info?.phase) setPhase(info.phase);
            if (typeof info?.percent === "number") setPercent(info.percent);
        });
    }, [updater]);
    const busy = phase !== "idle" && phase !== "error";
    const startUpdate = async () => {
        setError(null);
        setPercent(0);
        setPhase("downloading");
        try {
            await updater.start(latestVersion || null);
        } catch (e) {
            setPhase("error");
            setError(updateErrorMessage(e));
        }
    };
    return (
        <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(4,6,9,0.72)] backdrop-blur-[6px] pointer-events-auto"
             role="dialog" aria-modal="true" aria-labelledby="db-update-title">
            <div className="w-[min(520px,94vw)] grid gap-3 px-7 py-[24px] border border-gold-line rounded bg-[rgba(18,16,8,0.94)] text-text shadow motion-safe:animate-[dbPop_220ms_var(--ease-out)]">
                <div id="db-update-title"
                     className="font-display text-gold text-[22px] font-bold tracking-[2px] uppercase text-center">
                    Update Available
                </div>
                <p className="text-center text-[13px] text-dim m-0">
                    {latestVersion ? `DomeBreak v${latestVersion} is out` : "A newer DomeBreak is out"}
                    {currentVersion ? ` — you are on v${currentVersion}.` : "."}
                    {" "}Multiplayer requires the latest version; single player is unaffected.
                </p>
                {phase === "error" && (
                    <p className="text-center text-[12px] text-danger m-0" role="alert">
                        Automatic update failed: {error}
                    </p>
                )}
                {busy && (
                    <div className="h-[3px] rounded overflow-hidden bg-[rgba(255,255,255,0.1)]" role="progressbar"
                         aria-valuemin={0} aria-valuemax={100}
                         aria-valuenow={phase === "downloading" ? Math.round(percent * 100) : undefined}>
                        <div className="h-full bg-gold transition-[width] duration-150"
                             style={{width: `${phase === "downloading" ? Math.round(percent * 100) : 100}%`}}/>
                    </div>
                )}
                <div className="flex gap-2 justify-center flex-wrap mt-2">
                    {inDesktopApp && updater ? (
                        <button className={cn(menuButton({variant: "primary"}))} disabled={busy} onClick={startUpdate}>
                            {busy ? BUSY_LABEL[phase](percent) : phase === "error" ? "Try Again" : "Update Now"}
                        </button>
                    ) : inDesktopApp ? (
                        <a className={cn(menuButton({variant: "primary"}), "text-center no-underline")}
                           href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                            Get the Update
                        </a>
                    ) : (
                        <button className={cn(menuButton({variant: "primary"}))} onClick={() => window.location.reload()}>
                            Reload to Update
                        </button>
                    )}
                    {!busy && <button className={menuButton()} onClick={onDismiss}>Not Now</button>}
                </div>
                {inDesktopApp && updater && !busy && (
                    <a className="text-center text-[12px] text-dim underline underline-offset-2 hover:text-text"
                       href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                        or download the update manually
                    </a>
                )}
            </div>
        </div>
    );
}
