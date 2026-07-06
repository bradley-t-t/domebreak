-- GoldenDome accounts + game history. Dedicated project (bhzxnorbhylfsrdjzodv).
-- Frontend reads under RLS only; all writes flow through the gd-account edge
-- function (service role) or the signup trigger below.

-- One row per account; created_at is the "first join" date.
create table public.profiles
(
    id         uuid primary key references auth.users (id) on delete cascade,
    username   text unique not null check (char_length(username) between 3 and 24),
    created_at timestamptz not null default now(),
    last_login timestamptz not null default now()
);

alter table public.profiles enable row level security;

create
policy "read_own_profile" on public.profiles
    for
select using (auth.uid() = id);

-- One row per finished (or abandoned) game. Written only by gd-account.
create table public.matches
(
    id         uuid primary key     default gen_random_uuid(),
    user_id    uuid        not null references public.profiles (id) on delete cascade,
    started_at timestamptz,
    ended_at   timestamptz not null default now(),
    result     text        not null check (result in ('win', 'loss', 'quit')),
    nation_iso text,
    opponents  int,
    duration_s numeric,
    stats      jsonb       not null default '{}'::jsonb
);

alter table public.matches enable row level security;

create
policy "read_own_matches" on public.matches
    for
select using (auth.uid() = user_id);

create index matches_user_idx on public.matches (user_id, ended_at desc);

-- Lifetime aggregates; security_invoker keeps the caller's RLS in force.
create view public.player_stats with (security_invoker = true) as
select user_id,
       count(*)      as total_matches,
       count(*)         filter (where result = 'win')      as wins, count(*) filter (where result = 'loss')     as losses, count(*) filter (where result = 'quit')     as quits, coalesce(sum(duration_s), 0) as total_playtime_s,
       max(ended_at) as last_match_at
from public.matches
group by user_id;

-- Signup trigger: mint the profile from the auth row. Username comes from
-- signup metadata; falls back to a unique commander handle on collision so
-- account creation never fails on a taken name.
create
or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public as
$$
declare
want text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                          'commander_' || left(new.id::text, 8));
begin
begin
insert into public.profiles (id, username)
values (new.id, want);
exception
        when unique_violation then
            insert into public.profiles (id, username)
            values (new.id, left(want, 15) || '_' || left(new.id::text, 8))
            on conflict (id) do nothing;
end;
return new;
end
$$;

create trigger on_auth_user_created
    after insert
    on auth.users
    for each row
    execute function public.handle_new_user();
