import BetaApplyCard from "./BetaApplyCard.jsx";
import {Eyebrow} from "./Primitives.jsx";
import {cn} from "../lib/cn.js";

// Compact closed-beta pitch + application, for surfaces outside the landing band
// (the download pages). Left rail sells it; right rail is the shared apply card.
export default function BetaCallout({source = "download", className}) {
    return (
        <div className={cn("grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-12", className)}>
            <div>
                <Eyebrow>Closed Beta</Eyebrow>
                <h2 className="mt-4 font-display text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold uppercase leading-[1.05] text-text">
                    Test It Before Steam
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-relaxed text-dim">
                    Want in earlier? Apply for the closed beta — a small group of testers plays
                    ahead of the Steam launch and helps steer the build. Limited slots, invited in
                    waves.
                </p>
            </div>
            <BetaApplyCard source={source}/>
        </div>
    );
}
