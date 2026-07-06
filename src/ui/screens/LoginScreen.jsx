import {useState} from "react";
import {signIn, signUp} from "../../account/api.js";

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
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner">
                <h1 className="gd-menu-title">GOLDEN<span>DOME</span></h1>
                <p className="gd-menu-tag">Global Missile Command</p>
                <form className="gd-card gd-login" onSubmit={submit}>
                    <div className="gd-menu-title sm">{mode === "signin" ? "Sign In" : "Create Account"}</div>
                    <label className="gd-label">Email</label>
                    <input className="gd-input" type="email" autoComplete="email" value={email}
                           onChange={(e) => setEmail(e.target.value)} disabled={busy}/>
                    {mode === "signup" && <>
                        <label className="gd-label mt">Username</label>
                        <input className="gd-input" maxLength={24} autoComplete="username" value={username}
                               onChange={(e) => setUsername(e.target.value)} disabled={busy}/>
                    </>}
                    <label className="gd-label mt">Password</label>
                    <input className="gd-input" type="password"
                           autoComplete={mode === "signin" ? "current-password" : "new-password"}
                           value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}/>
                    {error && <p className="gd-login-err">{error}</p>}
                    <button className="gd-btn primary block gd-login-submit" type="submit" disabled={!canSubmit}>
                        {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                    <button className="gd-login-toggle" type="button" onClick={toggleMode} disabled={busy}>
                        {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}
