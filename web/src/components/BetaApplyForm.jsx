import {useState} from "react";
import {AnimatePresence, motion, useReducedMotion} from "motion/react";
import {Check, Loader2} from "lucide-react";
import {cn} from "../lib/cn.js";
import {button, input, label as labelCva} from "../lib/variants.js";
import {applyBeta, isValidEmail, BETA_PLATFORMS} from "../lib/beta.js";

// Closed-beta application. Minimal by design: email (required), platform, and an
// optional "why you want in". Shares the waitlist's submit/success pattern and a
// honeypot field to soak up bots. Posts to the public db-beta edge function.
export default function BetaApplyForm({source = "beta"}) {
    const reduce = useReducedMotion();
    const [email, setEmail] = useState("");
    const [platform, setPlatform] = useState("");
    const [reason, setReason] = useState("");
    const [company, setCompany] = useState(""); // honeypot
    const [status, setStatus] = useState("idle"); // idle | loading | done | error
    const [message, setMessage] = useState("");
    const [already, setAlready] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        if (status === "loading" || status === "done") return;
        if (!isValidEmail(email)) return fail("Enter a valid email address.");
        if (!platform) return fail("Pick the platform you'll test on.");
        setStatus("loading");
        setMessage("");
        const res = await applyBeta({email, platform, reason, company}, source);
        if (res.ok) {
            setAlready(res.already);
            setStatus("done");
        } else {
            fail(res.error);
        }
    }

    function fail(msg) {
        setStatus("error");
        setMessage(msg);
    }

    return (
        <div className="w-full max-w-xl">
            <AnimatePresence mode="wait" initial={false}>
                {status === "done" ? (
                    <motion.div
                        key="done"
                        initial={reduce ? {opacity: 0} : {opacity: 0, transform: "translateY(8px)"}}
                        animate={reduce ? {opacity: 1} : {opacity: 1, transform: "translateY(0px)"}}
                        transition={{duration: 0.4, ease: [0.23, 1, 0.32, 1]}}
                        className="relative db-tick flex items-start gap-3 rounded-sm border border-line bg-panel-2 px-4 py-[14px] backdrop-blur-[14px]"
                    >
                        <span className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-gold text-gold-contrast">
                            <Check size={13} strokeWidth={3}/>
                        </span>
                        <div className="min-w-0">
                            <p className="font-display text-[12.5px] font-semibold uppercase tracking-[1.5px] text-text">
                                {already ? "Already in the queue" : "Application received"}
                            </p>
                            <p className="mt-1 font-mono text-[12px] leading-relaxed text-dim">
                                {already
                                    ? "You've already applied — we'll email you if you're selected."
                                    : "Thanks for applying. If you're selected we'll email your invite before the beta opens."}
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.form key="form" onSubmit={onSubmit} initial={false} className="flex flex-col gap-4" noValidate>
                        {/* Honeypot — visually hidden, off the tab order. Bots fill it, humans don't. */}
                        <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                            <label>
                                Company
                                <input
                                    tabIndex={-1} autoComplete="off"
                                    value={company} onChange={(e) => setCompany(e.target.value)}
                                />
                            </label>
                        </div>

                        <div>
                            <label className={labelCva()} htmlFor="beta-email">Email</label>
                            <input
                                id="beta-email" type="email" inputMode="email" autoComplete="email"
                                placeholder="you@email.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (status === "error") setStatus("idle");
                                }}
                                className={cn(input(), "mt-[7px]", status === "error" && !isValidEmail(email) && "border-danger")}
                            />
                        </div>

                        <div>
                            <span className={labelCva()}>Platform you'll test on</span>
                            <div className="mt-[7px] grid grid-cols-3 gap-2" role="radiogroup" aria-label="Platform">
                                {BETA_PLATFORMS.map((p) => {
                                    const active = platform === p.id;
                                    return (
                                        <button
                                            key={p.id} type="button" role="radio" aria-checked={active}
                                            onClick={() => {
                                                setPlatform(p.id);
                                                if (status === "error") setStatus("idle");
                                            }}
                                            className={cn(
                                                "rounded-sm border px-3 py-[11px] font-display text-[12px] font-semibold uppercase tracking-[1.2px] transition-colors duration-150 ease-out-db cursor-pointer",
                                                active
                                                    ? "border-text bg-[#20242b] text-text"
                                                    : "border-line bg-sunk text-dim hover:border-blue hover:text-text"
                                            )}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className={labelCva()} htmlFor="beta-reason">
                                Why you want in <span className="text-faint">— optional</span>
                            </label>
                            <textarea
                                id="beta-reason" rows={3} maxLength={1000}
                                placeholder="Tell us how you'd play and what you'd help us break."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className={cn(input(), "mt-[7px] resize-none leading-relaxed")}
                            />
                        </div>

                        <button
                            type="submit" disabled={status === "loading"}
                            className={cn(button({variant: "primary", size: "lg"}), "w-full")}
                        >
                            {status === "loading"
                                ? <><Loader2 size={15} className="animate-spin"/><span>Sending</span></>
                                : "Apply for the closed beta"}
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="mt-2 min-h-[18px]">
                {status === "error" ? (
                    <p className="font-mono text-[11.5px] tracking-[0.3px] text-danger">{message}</p>
                ) : status !== "done" ? (
                    <p className="font-mono text-[11.5px] tracking-[0.3px] text-faint">
                        Limited slots · no spam · we only email if you're selected.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
