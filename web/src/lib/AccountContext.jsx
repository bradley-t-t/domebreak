import {createContext, useCallback, useContext, useEffect, useState} from "react";
import * as account from "./account.js";

const Ctx = createContext(null);

// Shared DomeBreak game-account state for the site: session, profile and career
// stats, plus auth actions. Wrap the app once; read with useAccount().
export function AccountProvider({children}) {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const hydrate = useCallback(async (s) => {
        if (!s) {
            setProfile(null);
            setStats(null);
            return;
        }
        const [p, st] = await Promise.all([account.fetchProfile(), account.fetchStats()]);
        setProfile(p);
        setStats(st);
    }, []);

    useEffect(() => {
        let alive = true;
        account.getSession().then(async (s) => {
            if (!alive) return;
            setSession(s);
            await hydrate(s);
            setLoading(false);
            if (s) account.touch();
        });
        const off = account.onAuth(async (s) => {
            if (!alive) return;
            setSession(s);
            await hydrate(s);
        });
        return () => {
            alive = false;
            off();
        };
    }, [hydrate]);

    const value = {
        session,
        profile,
        stats,
        loading,
        signedIn: !!session,
        signIn: account.signIn,
        signUp: account.signUp,
        signOut: async () => {
            await account.signOut();
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
