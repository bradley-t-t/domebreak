import {cva} from "class-variance-authority";

// Control vocabulary for buttons, labels and chips. Every branch is a full
// literal class string (Tailwind JIT requirement).

export const button = cva(
    "db-btn font-display inline-flex items-center justify-center gap-2 border border-line bg-linear-to-b from-btn-bg to-btn-bg-2 text-text rounded-sm font-semibold uppercase whitespace-nowrap shadow-[inset_0_1px_0_var(--hair)] transition-[border-color,box-shadow,filter,transform] duration-150 ease-out-db enabled:hover:border-blue active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer",
    {
        variants: {
            variant: {
                default: "",
                // Solid dark surface with white text and a bright border.
                // `bg-none` cancels the base gradient so the solid color shows
                // (a gradient bg-image would otherwise paint over the bg-color).
                primary:
                    "relative overflow-hidden bg-none bg-[#20242b] text-text border-gold-line shadow-[inset_0_1px_0_var(--hair)] enabled:hover:bg-[#282d35] enabled:hover:border-text",
                ghost:
                    "bg-transparent border-transparent shadow-none text-dim enabled:hover:text-text enabled:hover:border-line",
            },
            size: {
                sm: "px-[13px] py-[8px] text-[11px] tracking-[1.4px]",
                md: "px-[18px] py-[11px] text-[12.5px] tracking-[1.4px]",
                lg: "px-[22px] py-[14px] text-[13px] tracking-[2px]",
            },
        },
        defaultVariants: {variant: "default", size: "md"},
    }
);

export const label = cva(
    "block font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint"
);

export const chip = cva(
    "inline-flex items-center gap-2 font-display text-[11px] font-semibold tracking-[1.5px] uppercase px-3 py-[5px] rounded",
    {
        variants: {
            tone: {
                gold: "text-gold bg-gold-soft border border-gold-line",
                subtle: "text-dim bg-transparent border border-line",
            },
        },
        defaultVariants: {tone: "gold"},
    }
);

export const input = cva(
    "w-full bg-sunk border border-line text-text rounded-sm px-[14px] py-3 text-[15px] font-sans placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 ease-out-db focus:border-text focus:shadow-[0_0_0_3px_var(--gold-soft)]"
);
