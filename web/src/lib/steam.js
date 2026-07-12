// Single source of truth for the Steam store link. DomeBreak's Steam "Coming
// Soon" page isn't live yet, so STEAM_URL is a clearly-marked placeholder that
// points at the Steam storefront. When the real coming-soon page exists, drop
// its URL here (store.steampowered.com/app/<id>/<slug>) and flip STEAM_LIVE to
// true — every "Wishlist on Steam" CTA across the site reads from this file.
export const STEAM_URL = "https://store.steampowered.com/";
export const STEAM_LIVE = false;

// Label the CTAs share so wording stays consistent everywhere.
export const STEAM_CTA = STEAM_LIVE ? "Wishlist on Steam" : "Coming Soon on Steam";
