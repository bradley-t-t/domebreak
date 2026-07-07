import {cva} from "class-variance-authority";
// The .db-card "paper" re-theme lives (unlayered) in src/index.css — the one
// stylesheet — so it is globally present; no per-module CSS import here.

/**
 * DomeBreak shared primitive vocabulary (ADR-0005, Tailwind v4 migration).
 *
 * Every export below is a `cva()` call translating one primitive class from
 * the legacy styles.css into Tailwind utilities + the `@theme` tokens in
 * index.css, reproducing the original rule exactly. Where a `@layer vfx`
 * rule in index.css targets a class by name (a `::before`/`::after`
 * pseudo-element, or a `.db-card` descendant re-theme selector), that
 * literal class name is retained in the base string as a "VFX hook" —
 * removing it would silently break the pseudo-element/animation/re-theme
 * that keys off it. Each variant's doc comment says whether it carries one.
 *
 * All class strings are static/literal (no runtime concatenation) so
 * Tailwind's JIT scanner can see every utility that ever renders.
 *
 * Usage: call the variant function and pass the result straight to
 * className (optionally through cn() if you need to merge caller-supplied
 * overrides): `<button className={button({variant: "primary"})}>`.
 */

/* ---------------------------------------------------------------------- */
/* button — .db-btn / .db-btn.primary (styles.css ~321-371)                */
/* ---------------------------------------------------------------------- */
/**
 * VFX hook: retains literal `db-btn` (+ `primary`). `.db-btn.primary::after`
 * in @layer vfx is the hover sheen sweep; `.db-card .db-btn.primary` in
 * card-paper.css flips it to solid ink when nested in a modal card.
 */
export const button = cva(
    "db-btn font-display border border-line bg-linear-to-b from-btn-bg to-btn-bg-2 text-text px-[18px] py-[11px] rounded-sm text-[12.5px] font-semibold tracking-[1.4px] uppercase whitespace-nowrap shadow-[inset_0_1px_0_var(--hair)] transition-[border-color,box-shadow,filter] duration-150 ease-out-db enabled:hover:border-blue enabled:hover:shadow-[0_0_0_rgba(0,0,0,0),inset_0_1px_0_var(--hair)] disabled:opacity-60 disabled:cursor-not-allowed",
    {
        variants: {
            variant: {
                default: "",
                primary:
                    "primary relative overflow-hidden bg-gold text-gold-contrast border-[rgba(0,0,0,0.25)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] enabled:hover:filter enabled:hover:brightness-105",
            },
        },
        defaultVariants: {variant: "default"},
    }
);

/* ---------------------------------------------------------------------- */
/* miniButton — .db-mini (+ hover/danger/disabled) (styles.css ~525-548,   */
/* 1339-1347)                                                              */
/* ---------------------------------------------------------------------- */
/**
 * VFX hook: retains literal `db-mini` (+ `danger`). `.db-card .db-mini` and
 * `.db-card .db-mini.danger` in card-paper.css re-theme it to the light
 * paper surface when nested inside a `card()`.
 */
export const miniButton = cva(
    "db-mini font-display text-[11px] font-semibold px-[9px] py-1 rounded-sm border border-line bg-linear-to-b from-[#17191d] to-[#0f1114] text-text enabled:hover:border-blue disabled:opacity-40 disabled:cursor-not-allowed",
    {
        variants: {
            danger: {
                true: "danger border-[rgba(255,91,110,0.4)] text-[#ffb3bc] enabled:hover:bg-[rgba(255,91,110,0.14)] enabled:hover:border-danger",
                false: "",
            },
        },
        defaultVariants: {danger: false},
    }
);

/* ---------------------------------------------------------------------- */
/* iconButton — .db-iconbtn (styles.css ~2472-2520)                       */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-iconbtn. Utilities only.
 */
export const iconButton = cva(
    "w-[38px] h-[38px] rounded border border-line bg-panel text-text text-[17px] backdrop-blur-[8px] transition-transform duration-150 ease-out-db hover:border-blue active:scale-95"
);

/* ---------------------------------------------------------------------- */
/* menuButton — .db-menu-btn (+ .back/.primary/.danger), .db-menu-section  */
/* (styles.css ~2104-2201, section heading ~2175-2185)                    */
/* ---------------------------------------------------------------------- */
/**
 * VFX hook: retains literal `db-menu-btn` (+ `primary`/`back`/`danger`).
 * `.db-menu-btn::before/::after` in @layer vfx are the targeting-bracket
 * corners that snap in on hover/focus; `.db-card .db-menu-btn` and
 * `.db-card .db-menu-btn.primary` in card-paper.css re-theme it inside a
 * `card()`. The `section` variant is a distinct static heading (no button
 * semantics, no hook needed) kept here for call-site convenience since it
 * always appears alongside menu buttons.
 */
export const menuButton = cva(
    "db-menu-btn relative px-[18px] py-[13px] rounded-sm border border-line bg-[rgba(16,18,20,0.7)] text-text text-[12.5px] font-semibold tracking-[2.5px] uppercase transition-[transform,border-color,background] duration-150 ease-out-db hover:border-blue hover:-translate-y-px focus-visible:border-blue focus-visible:-translate-y-px active:scale-[0.98]",
    {
        variants: {
            variant: {
                default: "",
                primary: "primary bg-gold text-gold-contrast border-[rgba(0,0,0,0.25)]",
                back: "back bg-transparent border-transparent text-text opacity-70 mt-1 hover:opacity-100 hover:border-line focus-visible:opacity-100 focus-visible:border-line",
                danger: "danger hover:border-danger hover:text-danger",
                section:
                    "section relative text-[10px] font-semibold tracking-[3px] uppercase text-gold opacity-80 px-0.5 pb-0.5 mb-0.5 border-b border-line",
            },
        },
        defaultVariants: {variant: "default"},
    }
);

/* ---------------------------------------------------------------------- */
/* chip — .db-chip (+ .subtle) (styles.css ~127-144)                      */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-chip.
 */
export const chip = cva(
    "font-display text-xs font-semibold tracking-[1.5px] uppercase text-gold bg-gold-soft border border-gold-line px-3 py-[5px] rounded",
    {
        variants: {
            subtle: {
                true: "text-dim bg-[rgba(160,168,178,0.1)] border-line-soft",
                false: "",
            },
        },
        defaultVariants: {subtle: false},
    }
);

/* ---------------------------------------------------------------------- */
/* card — .db-card (+ .wide/.build/.result) (styles.css ~168-261)         */
/* ---------------------------------------------------------------------- */
/**
 * VFX hook: retains literal `db-card`. `.db-card::before` in @layer vfx is
 * the gold top-seam. The scoped light-"paper" custom-property overrides
 * (originally styles.css ~171-187, ~197-236) are re-implemented verbatim as
 * a plain CSS ruleset in ./card-paper.css, side-effect-imported at the top
 * of this file — so importing variants.js anywhere in the app is enough for
 * `.db-card` to carry the re-theme; no extra opt-in class/attribute needed
 * (this matches the legacy behavior exactly, where .db-card always implied
 * paper). See card-paper.css's header comment for the full rationale.
 */
export const card = cva(
    "db-card relative pointer-events-auto text-text bg-paper border border-[rgba(0,0,0,0.18)] rounded-lg shadow p-[26px] w-[min(560px,94vw)]",
    {
        variants: {
            size: {
                default: "",
                wide: "wide w-[min(460px,94vw)] text-center",
                build: "build w-[min(720px,96vw)]",
                result: "result w-[min(720px,96vw)]",
            },
        },
        defaultVariants: {size: "default"},
    }
);

/* ---------------------------------------------------------------------- */
/* overlay — .db-overlay (+ .center/.bottom) (styles.css ~147-164)        */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-overlay.
 */
// fixed (not absolute) so a modal is always anchored to the viewport, never to a
// positioned ancestor. FriendsPanel opens from MeBadge, whose menu root is
// `fixed top-[14px] right-4` — an `absolute inset-0` overlay filled that tiny
// corner box and threw the centered card off-screen. All overlay() consumers are
// full-screen modals, so viewport anchoring is correct for every one.
export const overlay = cva("fixed inset-0 z-[4] flex pointer-events-none", {
    variants: {
        placement: {
            none: "",
            center: "items-center justify-center",
            bottom: "items-end justify-center px-4 pb-[30px]",
        },
    },
    defaultVariants: {placement: "none"},
});

/* ---------------------------------------------------------------------- */
/* input — .db-input (+ .mono) (search hit in styles.css ~281-309)       */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-input.
 */
export const input = cva(
    "w-full bg-sunk border border-line text-text rounded-sm px-[14px] py-3 text-[15px] outline-none placeholder:text-faint transition-[border-color,box-shadow,background] duration-150 ease-out-db focus:border-text focus:bg-sunk focus:shadow-[0_0_0_3px_var(--gold-soft)]",
    {
        variants: {
            mono: {
                true: "font-mono text-xl tracking-[6px] text-center uppercase",
                false: "",
            },
        },
        defaultVariants: {mono: false},
    }
);

/* ---------------------------------------------------------------------- */
/* label — .db-label (styles.css ~270-279)                                */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-label.
 */
export const label = cva(
    "block font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint mb-[7px]"
);

/* ---------------------------------------------------------------------- */
/* sub — .db-sub (styles.css ~263-268)                                    */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-sub.
 */
export const sub = cva("text-dim m-0 mb-5 text-sm leading-[1.5]");

/* ---------------------------------------------------------------------- */
/* row — .db-row (+ direct .db-input child sizing) (styles.css ~311-319) */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-row. The original
 * `.db-row .db-input { flex: 1 }` is a descendant selector for a common
 * "input + button" row shape; reproduce it at the call site by adding
 * `flex-1` directly to whichever child(ren) should stretch, since cva can't
 * express a descendant-scoped utility.
 */
export const row = cva("flex gap-[10px] mt-4");

/* ---------------------------------------------------------------------- */
/* badge — .db-badge (+ .you) (styles.css ~1323-1337)                     */
/* ---------------------------------------------------------------------- */
/**
 * No VFX hook — no @layer vfx rule targets .db-badge.
 */
export const badge = cva(
    "font-display text-[11px] font-semibold text-dim px-[10px] py-1 border border-line rounded",
    {
        variants: {
            you: {
                true: "you text-gold border-gold-line bg-gold-soft",
                false: "",
            },
        },
        defaultVariants: {you: false},
    }
);

/* ---------------------------------------------------------------------- */
/* Menu chrome — shared across the centered menu screens (Lobby, Searching, */
/* etc.). (styles.css ~1959-2210)                                          */
/* ---------------------------------------------------------------------- */

/** Full-viewport centered overlay that hosts a menu card. No VFX hook. */
export const menuScreen = cva("absolute inset-0 z-10 grid place-items-center overflow-auto p-6");

/**
 * Vignette + faint grid-texture backdrop behind a menu card. The 44px grid
 * lines are the legacy `.db-menu-bg::after`, reproduced as an `after:` layer.
 */
export const menuBg = cva(
    "absolute inset-0 -z-10 bg-[radial-gradient(ellipse_130%_95%_at_50%_42%,transparent_42%,rgba(4,6,9,0.32)_76%,rgba(4,6,9,0.6)_100%)] after:content-[''] after:absolute after:inset-0 after:opacity-[0.045] after:bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] after:[background-size:44px_44px]"
);

/** The glass menu card itself; carries the dbRowIn entrance. No literal hook needed. */
export const menuInner = cva(
    "text-center animate-[dbRowIn_400ms_var(--ease-out)_both] pt-[38px] px-[46px] pb-[26px] border border-line-soft rounded-[var(--radius)] bg-[rgba(7,9,13,0.48)] [backdrop-filter:blur(10px)_saturate(1.15)] shadow-[0_30px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]"
);

/**
 * Menu heading. RETAINS the literal `db-menu-title` class — the `.db-card`
 * paper re-theme (unlayered in index.css) and the `.db-menu-title span` glow
 * both key off it.
 */
export const menuTitle = cva(
    "db-menu-title m-0 font-bold uppercase text-dim",
    {
        variants: {
            sm: {
                true: "text-[26px] tracking-[3px] mb-4",
                false: "text-[58px] tracking-[14px]",
            },
        },
        defaultVariants: {sm: false},
    }
);
