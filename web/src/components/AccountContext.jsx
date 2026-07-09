import {createContext, useContext, useEffect, useRef, useState} from "react";

const Ctx = createContext(null);

// Shared DomeBreak game-account state. The account module (which pulls in
// supabase-js, ~110 KB) is loaded LAZILY — dynamically imported after the page
// is idle — so it stays out of the initial bundle and off the critical path.
// The nav shows "Sign in" until the session check resolves.
export function AccountProvider({children}) {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    // Cache the dynamic import so every caller shares one module instance.
    const modRef = useRef(null);
    const getMod = () => (modRef.current ||= import("../lib/account.js"));

    useEffect(() => {
        let alive = true;
        const hydrate = async (a, s) => {
            if (!s) {
                setProfile(null);
                setStats(null);
                return;
            }
            const [p, st] = await Promise.all([a.fetchProfile(), a.fetchStats()]);
            if (!alive) return;
            setProfile(p);
            setStats(st);
        };
        let off = null;
        const start = async () => {
            const a = await getMod();
            if (!alive) return;
            const s = await a.getSession();
            if (!alive) return;
            setSession(s);
            await hydrate(a, s);
            setLoading(false);
            if (s) a.touch();
            off = a.onAuth(async (ns) => {
                if (!alive) return;
                setSession(ns);
                await hydrate(a, ns);
            });
        };
        const id = "requestIdleCallback" in window
            ? window.requestIdleCallback(start, {timeout: 2500})
            : setTimeout(start, 400);
        return () => {
            alive = false;
            off?.();
            if ("cancelIdleCallback" in window) window.cancelIdleCallback(id);
            else clearTimeout(id);
        };
    }, []);

    const value = {
        session,
        profile,
        stats,
        loading,
        signedIn: !!session,
        signIn: async (...a) => (await getMod()).signIn(...a),
        signUp: async (...a) => (await getMod()).signUp(...a),
        signOut: async () => {
            await (await getMod()).signOut();
            setSession(null);
            setProfile(null);
            setStats(null);
        },
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useAccount must be used within AccountProvider");
    return v;
}
