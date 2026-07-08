# DomeBreak — Landing Page

Marketing site + email waitlist for DomeBreak. Separate Vite app from the game
in `src/`; shares the in-game design language (tokens lifted from the game's
`src/index.css`, Inter + JetBrains Mono, hairline/mono "Anduril-school" look).

## Stack

- React 19 + Vite 7 + Tailwind CSS v4 (config-less, via `@tailwindcss/vite`)
- `motion` for scroll reveals / parallax
- Screenshots in `public/shots/` are real captures of the game console

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:5180
npm run build    # -> dist/
```

## Waitlist backend

Signups POST to the `db-waitlist` Supabase edge function
(`../supabase/functions/db-waitlist`), which inserts one row server-side with the
service role. The client only carries the public `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` (see `.env.local`).

One-time setup on the DomeBreak Supabase project:

1. Create the `waitlist` table (schema in the edge function header comment).
2. `supabase functions deploy db-waitlist`.

## Deploy

Vercel project with **root directory = `web/`**, framework Vite. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
