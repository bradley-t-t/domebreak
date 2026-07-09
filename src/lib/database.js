// Single home for the database glue used across account / lobby / party /
// social and presence hooks: edge-function invoker factory, RLS-scoped
// single-row read, current-user id, and the channel + poll live-watch
// lifecycle. Concrete backend is Supabase (see src/account/client.js);
// semantics match the pre-extraction copies in src/account/*.

import {supabase} from "../account/client.js";

// Build a `body -> Promise<{ok?, error?, ...data}>` invoker for one db-* edge
// function. `retries` gives a one-more attempt on the raw invoke error, which
// is how reportMatch already retried in api.js.
export function createEdgeInvoker(fnName, opts = {}) {
    const {retries = 0} = opts;
    return async (body) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            const {data, error} = await supabase.functions.invoke(fnName, {body});
            if (!error) return data ?? {ok: true};
            if (attempt === retries) return {error: error.message || String(error)};
        }
        return {error: "unreachable"};
    };
}

// One place to fetch the signed-in user id (or null). Prefers the cached
// session so we don't contend on the auth lock unless we have to.
export async function currentUserId() {
    const {data} = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
}

// RLS-scoped single-row read. Discards any error and returns `fallback`
// (default null) instead. Pass `eq: [col, val]` to filter; omit for the
// caller's own row (as in matchmaking_queue).
export async function readRow(table, opts = {}) {
    const {select = "*", eq, fallback = null} = opts;
    let q = supabase.from(table).select(select);
    if (eq) q = q.eq(eq[0], eq[1]);
    const {data} = await q.maybeSingle();
    return data ?? fallback;
}

// Subscribe to postgres_changes on one or more tables through a single
// channel, with a heartbeat poll fallback so a missed Realtime event can't
// strand the UI. Returns an unsubscribe fn.
//
// tables: [{table, filter, event = "*", schema = "public"}]
export function watchRows({channel, tables, pollMs = 5000, cb}) {
    let ch = supabase.channel(channel);
    for (const t of tables) {
        ch = ch.on("postgres_changes", {
            event: t.event || "*",
            schema: t.schema || "public",
            table: t.table,
            filter: t.filter,
        }, cb);
    }
    ch.subscribe();
    const poll = pollMs > 0 ? setInterval(cb, pollMs) : null;
    return () => {
        if (poll) clearInterval(poll);
        supabase.removeChannel(ch);
    };
}
