import {clsx} from "clsx";
import {twMerge} from "tailwind-merge";

// Same helper the game uses: merge conditional class lists, letting later
// Tailwind utilities win over earlier ones.
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
