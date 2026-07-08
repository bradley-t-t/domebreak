import {useEffect, useRef, useState} from "react";
import {AnimatePresence, motion} from "motion/react";
import {X, Loader2} from "lucide-react";
import {cn} from "../lib/cn.js";
import {button, input, label as labelCva} from "../lib/variants.js";
import {AUTH_RULES} from "../lib/account.js";
import {useAccount} from "../lib/AccountContext.jsx";
import GameIcon from "./GameIcon.jsx";

// Sign in / sign up with a DomeBreak game account. Email + password (username on
// sign-up), same as the in-game login. Uses the shared account context.
export default function AuthModal({open, onClose, initialMode = "signin"}) {
    const {signIn, signUp} = useAccount();
    const [mode, setMode] = useState(initialMode);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [status, setStatus] = useState("idle"); // idle | loading | error
    const [error, setError] = useState("");
    const emailRef = useRef(null);

    useEffect(() => {
        if (open) {
            setMode(initialMode);
            setStatus("idle");
            setError("");
            setTimeout(() => emailRef.current?.focus(), 60);
        }
    }, [open, initialMode]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    async function onSubmit(e) {
        e.preventDefault();
        if (status === "loading") return;
        const em = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail("Enter a valid email address.");
        if (password.length < AUTH_RULES.password.min) return fail(`Password must be at least ${AUTH_RULES.password.min} characters.`);
        if (mode === "signup") {
            const u = username.trim();
            if (u.length < AUTH_RULES.username.min || u.length > AUTH_RULES.username.max)
                return fail(`Callsign must be ${AUTH_RULES.username.min}–${AUTH_RULES.username.max} characters.`);
        }
        setStatus("loading");
        setError("");
        const res = mode === "signin" ? await signIn(em, password) : await signUp(em, password, username.trim());
        if (res.error) return fail(res.error);
        onClose();
    }

    function fail(msg) {
        setStatus("error");
        setError(msg);
    }

    const signup = mode === "signup";

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    transition={{duration: 0.18}}
                >
                    <div className="absolute inset-0 bg-[rgba(4,6,9,0.72)] backdrop-blur-[4px]" onClick={onClose}/>
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={signup ? "Create account" : "Sign in"}
                        initial={{opacity: 0, transform: "translateY(10px) scale(0.98)"}}
                        animate={{opacity: 1, transform: "translateY(0px) scale(1)"}}
                        exit={{opacity: 0, transform: "translateY(8px) scale(0.98)"}}
                        transition={{duration: 0.22, ease: [0.23, 1, 0.32, 1]}}
                        className="relative db-tick db-seam w-[min(420px,94vw)] overflow-hidden rounded-lg border border-line bg-panel-solid p-7 shadow"
                    >
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-sm border border-line text-dim transition-colors hover:border-blue hover:text-text"
                        >
                            <X size={15}/>
                        </button>

                        <div className="flex items-center gap-2 text-gold">
                            <GameIcon name="dome" size={22}/>
                            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">
                                {signup ? "Enlist" : "Commander Login"}
                            </span>
                        </div>
                        <h2 className="mt-4 font-display text-[22px] font-bold uppercase tracking-[0.04em] text-text">
                            {signup ? "Create your command" : "Sign in"}
                        </h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-dim">
                            {signup
                                ? "Your DomeBreak account carries your callsign, avatar and career record across the game and this site."
                                : "Use your DomeBreak game account. Same credentials, everywhere."}
                        </p>

                        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                            {signup && (
                                <div>
                                    <label className={labelCva()} htmlFor="auth-username">Callsign</label>
                                    <input
                                        id="auth-username" className={cn(input(), "mt-[7px]")}
                                        value={username} onChange={(e) => setUsername(e.target.value)}
                                        placeholder="CmdrPhoenix" autoComplete="username" maxLength={24}
                                    />
                                </div>
                            )}
                            <div>
                                <label className={labelCva()} htmlFor="auth-email">Email</label>
                                <input
                                    id="auth-email" ref={emailRef} type="email" inputMode="email"
                                    className={cn(input(), "mt-[7px]", status === "error" && "border-danger")}
                                    value={email} onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (status === "error") setStatus("idle");
                                }}
                                    placeholder="commander@nation.gov" autoComplete="email"
                                />
                            </div>
                            <div>
                                <label className={labelCva()} htmlFor="auth-password">Password</label>
                                <input
                                    id="auth-password" type="password"
                                    className={cn(input(), "mt-[7px]")}
                                    value={password} onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (status === "error") setStatus("idle");
                                }}
                                    placeholder="••••••••" autoComplete={signup ? "new-password" : "current-password"}
                                />
                            </div>

                            <div className="min-h-[16px]">
                                {status === "error" && (
                                    <p className="font-mono text-[11.5px] text-danger">{error}</p>
                                )}
                            </div>

                            <button
                                type="submit" disabled={status === "loading"}
                                className={cn(button({variant: "primary", size: "lg"}), "w-full")}
                            >
                                {status === "loading"
                                    ? <><Loader2 size={15} className="animate-spin"/><span>Standby</span></>
                                    : signup ? "Create account" : "Sign in"}
                            </button>
                        </form>

                        <div className="mt-5 border-t border-hair pt-4 text-center">
                            <button
                                onClick={() => {
                                    setMode(signup ? "signin" : "signup");
                                    setStatus("idle");
                                    setError("");
                                }}
                                className="font-mono text-[12px] text-dim transition-colors hover:text-text"
                            >
                                {signup
                                    ? "Already enlisted? Sign in"
                                    : "New commander? Create an account"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
