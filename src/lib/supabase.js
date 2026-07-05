import {createClient} from "@supabase/supabase-js";

// Anon client: reads game state under RLS and subscribes to realtime. All
// mutations go through the gd-match edge function, never straight from here.
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {auth: {persistSession: false}, realtime: {params: {eventsPerSecond: 5}}},
);
