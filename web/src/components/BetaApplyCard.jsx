import BetaApplyForm from "./BetaApplyForm.jsx";
import {cn} from "../lib/cn.js";

// The closed-beta application, wrapped in the console "instrument panel" card.
// Reused by the featured landing band and by the download pages, so the form
// lives in exactly one place. `source` tags where the application came from.
export default function BetaApplyCard({source = "beta", className}) {
    return (
        <div className={cn("relative db-tick db-seam rounded-lg border border-line bg-panel-solid p-6 shadow sm:p-8", className)}>
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-faint">
                Beta Tester Application
            </h3>
            <div className="mt-6">
                <BetaApplyForm source={source}/>
            </div>
        </div>
    );
}
