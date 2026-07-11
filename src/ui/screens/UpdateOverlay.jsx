import {menuButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Update prompt: shown when a newer release is published (useUpdateCheck) or
// the server rejected our hello as outdated. Single player stays playable —
// this is dismissible — but multiplayer entry routes here until the client is
// current, mirroring the server's hard version gate.
//
// The CTA depends on how this build runs: the desktop app (preload exposes
// window.dbLocal) must download a new installer, while a browser client is
// served fresh code on reload.
// Hash route — the marketing site is a hash-routed SPA (web/src/hooks/
// useHashRoute.js). The site also 308s the bare /download path here for the
// installers that shipped linking it.
const DOWNLOAD_URL = "https://domebreak.com/#/download";

export default function UpdateOverlay({currentVersion, latestVersion, onDismiss}) {
    const inDesktopApp = typeof window !== "undefined" && !!window.dbLocal;
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
                <div className="flex gap-2 justify-center flex-wrap mt-2">
                    {inDesktopApp ? (
                        <a className={cn(menuButton({variant: "primary"}), "text-center no-underline")}
                           href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                            Get the Update
                        </a>
                    ) : (
                        <button className={cn(menuButton({variant: "primary"}))} onClick={() => window.location.reload()}>
                            Reload to Update
                        </button>
                    )}
                    <button className={menuButton()} onClick={onDismiss}>Not Now</button>
                </div>
            </div>
        </div>
    );
}
