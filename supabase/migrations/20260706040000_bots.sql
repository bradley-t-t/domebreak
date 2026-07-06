-- Bot players. Honoring the "no 100 real logins" model: bots are NOT auth-backed
-- profiles — they live in their own table and join lobbies as non-auth members
-- (see the follow-up migration that makes lobbies host-less + members bot-aware).
-- This migration is purely additive: it introduces the bot identities and a flag.

alter table public.profiles
    add column if not exists is_bot boolean not null default false;

create table if not exists public.bots
(
    id         uuid primary key     default gen_random_uuid(),
    name       text unique not null,
    created_at timestamptz not null default now()
);

alter table public.bots enable row level security;

-- Bots are visible to any signed-in player (they show up in lobbies/rosters).
drop policy if exists "read_bots_authenticated" on public.bots;
create policy "read_bots_authenticated" on public.bots
    for select using (auth.role() = 'authenticated');

-- Seed 100 distinct commander callsigns (10 adjectives x 10 nouns). Idempotent.
insert into public.bots (name)
select adj || ' ' || noun
from (values ('Iron'), ('Crimson'), ('Silent'), ('Vanguard'), ('Nova'),
             ('Obsidian'), ('Rogue'), ('Titan'), ('Phantom'), ('Arctic')) as a(adj)
         cross join (values ('Hawk'), ('Sentinel'), ('Warden'), ('Reaper'), ('Falcon'),
                            ('Cobra'), ('Viper'), ('Wolf'), ('Talon'), ('Spectre')) as n(noun)
on conflict (name) do nothing;
