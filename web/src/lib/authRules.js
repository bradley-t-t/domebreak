// Client-side auth validation rules. Kept free of supabase-js so components can
// import it without pulling the (lazy-loaded) account module into the bundle.
export const AUTH_RULES = {username: {min: 3, max: 24}, password: {min: 8}};
