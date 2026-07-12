-- Closed-beta tester applications (public capture) plus an admin flag on
-- profiles so a trusted account can review them. Mirrors the waitlist
-- discipline: the table is deny-all under RLS and only the db-beta edge
-- function (service role) ever reads or writes it. The public landing page
-- posts an application; an admin reads the list through the same function.

create table if not exists public.beta_applications (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    platform text not null,          -- 'mac' | 'win' | 'both'
    reason text,                     -- optional "why you want in"
    source text,                     -- where the application came from
    user_agent text,
    created_at timestamptz not null default now()
);

-- One application per email; a re-apply is treated as "already applied".
create unique index if not exists beta_applications_email_key
    on public.beta_applications (lower(email));

alter table public.beta_applications enable row level security;
-- No policies on purpose: RLS denies all client access. The service role,
-- used only inside the db-beta edge function, bypasses RLS.

-- Admin flag used to gate the review panel. Grant it to your own account once:
--   update public.profiles set is_admin = true where id = '<your-user-id>';
alter table public.profiles
    add column if not exists is_admin boolean not null default false;
