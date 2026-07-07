// Supabase client for the dedicated DomeBreak project. Anon key + RLS:
// this client READS only — every write goes through the db-account edge
// function (see api.js). The auth session persists through localStorage and,
// on desktop, mirrors into the machine-local data folder.
import {createClient} from "@supabase/supabase-js";
import {persistKey, removeKey} from "../game/platform/localData.js";

const authStorage = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => {
        localStorage.setItem(k, v);
        persistKey(k);
    },
    removeItem: (k) => removeKey(k),
};

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {auth: {storage: authStorage, persistSession: true, autoRefreshToken: true, storageKey: "domebreak.auth"}},
);
