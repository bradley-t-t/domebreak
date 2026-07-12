import Icon from "./Icon.jsx";
import {cn} from "../lib/cn.js";

// The command-points currency mark followed by an amount — the single place that
// decides how a points figure reads across the arsenal cards and unit sheets.
export default function Points({value, size = 11, className}) {
    return (
        <span className={cn("inline-flex items-center gap-1", className)}>
            <Icon name="points" size={size}/>{value}
        </span>
    );
}
