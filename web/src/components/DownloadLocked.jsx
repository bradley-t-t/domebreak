import {useEffect} from "react";
import {Lock, Loader2, LogIn} from "lucide-react";
import Nav from "./Nav.jsx";
import Footer from "./Footer.jsx";
import Reveal from "./Reveal.jsx";
import SteamCta from "./SteamCta.jsx";
import BetaCallout from "./BetaCallout.jsx";
import {Eyebrow} from "./Primitives.jsx";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";

// Shown in place of the download page when the visitor isn't signed in. Direct
// installers are gated to signed-in accounts now that the public build is headed
// to Steam; `checking` renders a quiet standby while the lazy account session
// resolves so we never flash "locked" at a visitor who is actually signed in.
export default function DownloadLocked({onSignIn, onShowShortcuts, checking = false}) {
    useEffect(() => {
        window.scrollTo({top: 0, behavior: "auto"});
    }, []);

    return (
        <div className="relative min-h-screen bg-bg text-text">
            <Nav onSignIn={onSignIn}/>

            <main>
                <section className="relative overflow-hidden pt-28 pb-24 sm:pt-32 sm:pb-28">
                    <div aria-hidden className="pointer-events-none absolute inset-0 db-grid"/>
                    <div aria-hidden className="pointer-events-none absolute inset-0 db-vignette"/>

                    <div className="relative mx-auto max-w-[1100px] px-5 sm:px-8">
                        <Reveal>
                            <div className="relative db-tick db-seam mx-auto max-w-[560px] overflow-hidden rounded-lg border border-line bg-panel-solid p-8 text-center shadow sm:p-10">
                                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded border border-gold-line bg-gold-soft text-gold">
                                    {checking ? <Loader2 size={26} className="animate-spin"/> : <Lock size={26}/>}
                                </span>

                                <div className="mt-6 flex justify-center">
                                    <Eyebrow>{checking ? "Checking Access" : "Restricted"}</Eyebrow>
                                </div>

                                <h1 className="mt-4 font-display text-[clamp(1.6rem,4vw,2.3rem)] font-bold uppercase leading-[1.05] text-text">
                                    {checking ? "One Moment" : "Sign In to Download"}
                                </h1>
                                <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-dim">
                                    {checking
                                        ? "Confirming your session before the download links load."
                                        : "Direct installers are available to signed-in DomeBreak accounts. The public release is coming to Steam — wishlist it to get notified at launch."}
                                </p>

                                {!checking && (
                                    <div className="mt-8 flex flex-col items-center gap-3">
                                        <button
                                            onClick={onSignIn}
                                            className={cn(button({variant: "primary", size: "lg"}), "w-full max-w-xs")}
                                        >
                                            <LogIn size={15}/>
                                            <span>Sign In</span>
                                        </button>
                                        <SteamCta className="w-full max-w-xs" size="md"/>
                                    </div>
                                )}
                            </div>
                        </Reveal>

                        {/* No account? Applying for the closed beta is the way in. */}
                        {!checking && (
                            <Reveal delay={0.12}>
                                <div className="mt-14 border-t border-line pt-14 text-left">
                                    <BetaCallout source="download-locked"/>
                                </div>
                            </Reveal>
                        )}
                    </div>
                </section>
            </main>

            <Footer onShowShortcuts={onShowShortcuts}/>
        </div>
    );
}
