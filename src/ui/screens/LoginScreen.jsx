import {useState} from "react";
import {signIn, signUp} from "../../account/api.js";
import {button, card, input, label} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// Full-screen auth gate — same brand shell as StartMenu, swapped for a form.
// No navigation here: App's onAuth subscription takes over once the session
// updates, so this component only ever talks to the account API and reports
// its own busy/error state.
export default function LoginScreen() {
    const [mode, setMode] = useState("signin"); // "signin" | "signup"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const validSignup = username.trim().length >= 3 && username.trim().length <= 24 && password.length >= 8;
    const canSubmit = !!email.trim() && !!password && (mode === "signin" || validSignup) && !busy;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        if (mode === "signin") {
            const r = await signIn(email.trim(), password);
            if (r.error) {
                setError(r.error);
                setBusy(false);
            }
            // success: onAuth fires in App, this screen unmounts
            return;
        }
        const r = await signUp(email.trim(), password, username.trim());
        if (r.error) {
            setError(r.error);
            setBusy(false);
            return;
        }
        // Autoconfirm may or may not hand back a session on signUp — sign in
        // right after so both cases land on an authenticated session.
        const r2 = await signIn(email.trim(), password);
        if (r2.error) {
            setError(r2.error);
            setBusy(false);
        }
    };

    const toggleMode = () => {
        setMode((m) => (m === "signin" ? "signup" : "signin"));
        setError(null);
    };

    return (
        <div className="absolute inset-0 z-10 grid place-items-center overflow-auto p-6">
            <div className="absolute inset-0 -z-1 bg-[radial-gradient(ellipse_130%_95%_at_50%_42%,transparent_42%,rgba(4,6,9,0.32)_76%,rgba(4,6,9,0.6)_100%)]"/>
            <div className="text-center animate-[dbRowIn_400ms_var(--ease-out-db)_both] pt-[38px] px-[46px] pb-[26px] border border-line-soft rounded backdrop-blur-[10px] [backdrop-filter:blur(10px)_saturate(1.15)] bg-[rgba(7,9,13,0.48)] shadow-[0_30px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]">
                <h1 className="text-[58px] font-bold tracking-[14px] uppercase m-0 text-dim">
                    DOME<span className="text-text [text-shadow:var(--glow-gold)] animate-[dbTitleGlow_6s_var(--ease-in-out)_infinite_alternate]">BREAK</span>
                </h1>
                <p className="text-dim tracking-[3px] uppercase text-[13px] mt-1 mb-[34px]">Global Missile Command</p>
                <form className={cn(card(), "text-left mt-[22px] w-[min(360px,94vw)]")} onSubmit={submit} aria-labelledby="db-login-title">
                    <div className="text-[26px] tracking-[3px] mb-4 font-bold uppercase m-0 text-dim" id="db-login-title">{mode === "signin" ? "Sign In" : "Create Account"}</div>
                    <label className={label()} htmlFor="db-login-email">Email</label>
                    <input id="db-login-email" className={input()} type="email" autoComplete="email" value={email}
                           onChange={(e) => setEmail(e.target.value)} disabled={busy}
                           aria-invalid={!!error} aria-describedby={error ? "db-login-err" : undefined}/>
                    {mode === "signup" && <>
                        <label className={cn(label(), "mt-4")} htmlFor="db-login-username">Username</label>
                        <input id="db-login-username" className={input()} maxLength={24} autoComplete="username"
                               value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy}/>
                    </>}
                    <label className={cn(label(), "mt-4")} htmlFor="db-login-password">Password</label>
                    <input id="db-login-password" className={input()} type="password"
                           autoComplete={mode === "signin" ? "current-password" : "new-password"}
                           value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
                           aria-invalid={!!error} aria-describedby={error ? "db-login-err" : undefined}/>
                    <div aria-live="assertive">
                        {error && <p className="text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm px-3 py-2 text-[12.5px] mt-3.5 mb-0" id="db-login-err">{error}</p>}
                    </div>
                    <button className={cn(button({variant: "primary"}), "block w-full mt-[18px]")} type="submit" disabled={!canSubmit}>
                        {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                    <button className="block w-full mt-3 bg-none border-none text-dim text-xs tracking-[0.3px] underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:text-text"
                            type="button" onClick={toggleMode} disabled={busy}>
                        {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}
