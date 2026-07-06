import {clsx} from "clsx";
import {twMerge} from "tailwind-merge";

/**
 * Merge conditional class names, de-duplicating conflicting Tailwind utilities
 * (the later class wins). Always pass full, literal class strings — never
 * concatenate class fragments at runtime, or the JIT engine can't see them.
 *
 * @param {...(string|false|null|undefined|Record<string, boolean>)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
