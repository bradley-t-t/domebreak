import {cn} from "../lib/cn.js";
import {STEAM_URL, STEAM_CTA} from "../lib/steam.js";
import ShinyText from "./reactbits/ShinyText.jsx";
import StarBorder from "./reactbits/StarBorder.jsx";

// Steam brand mark (simple-icons path). Inherits currentColor so it tints with
// the surrounding text.
export function SteamGlyph({size = 18, className}) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className={className}>
            <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
        </svg>
    );
}

// Primary "Coming Soon on Steam / Wishlist on Steam" call to action — the site's
// main conversion now that DomeBreak is heading to Steam. Wraps the CTA in
// react-bits StarBorder (a sweeping Steam-blue edge glow) with an inner surface
// squared and toned to match the console button language, and shimmers the label
// with react-bits ShinyText. Reads from lib/steam.js so the link swaps in one
// place when the store page goes live.
export default function SteamCta({className, size = "lg"}) {
    const pad = size === "lg" ? "py-[15px] px-[26px]" : "py-[12px] px-[20px]";
    const text = size === "lg" ? "text-[13px]" : "text-[11.5px]";
    return (
        <StarBorder
            as="a"
            href={STEAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${STEAM_CTA} — opens Steam in a new tab`}
            color="#66c0f4"
            speed="5s"
            radius={4}
            className={cn("group db-tick align-middle", className)}
            innerClassName={cn(
                "flex items-center justify-center gap-2.5 bg-[#20242b] border border-gold-line text-text",
                "font-display font-semibold uppercase tracking-[2px] transition-colors duration-150 ease-out-db",
                "group-hover:border-text group-hover:bg-[#282d35]",
                pad, text
            )}
        >
            <SteamGlyph size={size === "lg" ? 18 : 15} className="text-[#66c0f4]"/>
            <ShinyText text={STEAM_CTA} speed={4} color="#c9d2db" shineColor="#ffffff"/>
        </StarBorder>
    );
}

// Compact Steam link for the nav bar — same destination, no StarBorder chrome so
// it sits quietly in the header cluster.
export function SteamNavLink({className}) {
    return (
        <a
            href={STEAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${STEAM_CTA} — opens Steam in a new tab`}
            className={cn(
                "db-btn font-display inline-flex items-center gap-2 rounded-sm border border-gold-line bg-[#20242b] px-[14px] py-[8px]",
                "text-[11px] font-semibold uppercase tracking-[1.4px] text-text",
                "transition-colors duration-150 ease-out-db hover:border-text hover:bg-[#282d35] cursor-pointer",
                className
            )}
        >
            <SteamGlyph size={14} className="text-[#66c0f4]"/>
            <span className="hidden sm:inline">{STEAM_CTA}</span>
            <span className="sm:hidden">Steam</span>
        </a>
    );
}
