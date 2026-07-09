import {useState} from "react";
import {AnimatePresence, motion, useReducedMotion} from "motion/react";
import {Check, Loader2} from "lucide-react";
import {cn} from "../lib/cn.js";
import {button, input} from "../lib/variants.js";
import {isValidEmail, joinWaitlist} from "../lib/waitlist.js";

// Email capture. Two layouts: "inline" (single row, for the hero) and "stacked"
// (label + field + button, for the big CTA band). Both share one submit path.
export default function WaitlistForm({source = "landing", layout = "inline", cta = "Request Access"}) {
    const reduce = useReducedMotion();
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState("idle"); // idle | loading | done | error
    const [message, setMessage] = useState("");
    const [already, setAlready] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        if (status === "loading" || status === "done") return;
        if (!isValidEmail(email)) {
            setStatus("error");
            setMessage("Enter a valid email address.");
            return;
        }
        setStatus("loading");
        setMessage("");
        const res = await joinWaitlist(email, source);
        if (res.ok) {
            setAlready(res.already);
            setStatus("done");
        } else {
            setStatus("error");
            setMessage(res.error);
        }
    }

    const stacked = layout === "stacked";

    return (
        <div className={cn("w-full", stacked ? "max-w-xl" : "max-w-lg")}>
            <AnimatePresence mode="wait" initial={false}>
                {status === "done" ? (
                    <motion.div
                        key="done"
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(8px)"}}
                        animate={reduce ? {opacity: 1} : {opacity: 1, transform: "translateY(0px)"}}
                        transition={{duration: 0.4, ease: [0.23, 1, 0.32, 1]}}
                        className="relative db-tick flex items-start gap-3 border border-line bg-panel-2 rounded-sm px-4 py-[14px] backdrop-blur-[14px]"
                    >
                        <span
                            className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-gold text-gold-contrast">
                            <Check size={13} strokeWidth={3}/>
                        </span>
                        <div className="min-w-0">
                            <p className="font-display text-[12.5px] font-semibold uppercase tracking-[1.5px] text-text">
                                {already ? "Already on the list" : "Access requested"}
                            </p>
                            <p className="mt-1 font-mono text-[12px] leading-relaxed text-dim">
                                {already
                                    ? "You're already on the list. We'll email you when it's out."
                                    : "You're on the list. We'll email you when it's out."}
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.form
                        key="form"
                        onSubmit={onSubmit}
                        initial={false}
                        className={cn("flex gap-2", stacked ? "flex-col sm:flex-row" : "flex-col sm:flex-row")}
                        noValidate
                    >
                        <div className="relative flex-1">
                            <input
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                placeholder="you@email.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (status === "error") setStatus("idle");
                                }}
                                aria-label="Email address"
                                className={cn(input(), status === "error" && "border-danger focus:border-danger")}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={status === "loading"}
                            className={cn(button({variant: "primary", size: stacked ? "lg" : "md"}), "shrink-0")}
                        >
                            {status === "loading" ? (
                                <>
                                    <Loader2 size={14} className="animate-spin"/>
                                    <span>Sending</span>
                                </>
                            ) : (
                                cta
                            )}
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="mt-2 min-h-[18px]">
                {status === "error" ? (
                    <p className="font-mono text-[11.5px] tracking-[0.3px] text-danger">{message}</p>
                ) : status !== "done" ? (
                    <p className="font-mono text-[11.5px] tracking-[0.3px] text-faint">
                        Early access · no spam · one email when we launch.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
