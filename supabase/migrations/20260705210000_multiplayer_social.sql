-- Multiplayer control plane + friends. Writes flow through gd-social/gd-lobby
-- edge functions and the game server (service role); clients read under RLS.

-- Friends must be able to find each other: profiles become readable by any
-- authenticated user (replaces the own-row-only policy from 20260705190000).
drop
policy "read_own_profile" on public.profiles;
create
policy "read_profiles_authenticated" on public.profiles
    for
select using (auth.role() = 'authenticated');

-- Distinguish solo reports from server-recorded online results.
alter table public.matches
    add column mode text not null default 'solo' check (mode in ('solo', 'online')),
    add column match_id uuid;

create table public.friendships
(
    id         uuid primary key     default gen_random_uuid(),
    requester  uuid        not null references public.profiles (id) on delete cascade,
    addressee  uuid        not null references public.profiles (id) on delete cascade,
    status     text        not null default 'pending' check (status in ('pending', 'accepted')),
    created_at timestamptz not null default now(),
    unique (requester, addressee),
    check (requester <> addressee)
);

alter table public.friendships enable row level security;

create
policy "read_own_friendships" on public.friendships
    for
select using (auth.uid() = requester or auth.uid() = addressee);

create table public.lobbies
(
    id          uuid primary key     default gen_random_uuid(),
    host        uuid        not null references public.profiles (id) on delete cascade,
    name        text        not null check (char_length(name) between 1 and 40),
    status      text        not null default 'open' check (status in ('open', 'starting', 'active', 'closed')),
    max_players int         not null default 8 check (max_players between 2 and 16),
    ai_slots    int         not null default 0 check (ai_slots between 0 and 15),
    match_id    uuid,
    server_url  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.lobbies enable row level security;

create
policy "read_lobbies_authenticated" on public.lobbies
    for
select using (auth.role() = 'authenticated');

create index lobbies_status_idx on public.lobbies (status, created_at);

create table public.lobby_members
(
    lobby_id  uuid        not null references public.lobbies (id) on delete cascade,
    user_id   uuid        not null references public.profiles (id) on delete cascade,
    slot      int         not null check (slot between 0 and 15),
    iso       text        not null default 'US',
    ready     boolean     not null default false,
    joined_at timestamptz not null default now(),
    primary key (lobby_id, user_id),
    unique (lobby_id, slot)
);

alter table public.lobby_members enable row level security;

create
policy "read_lobby_members_authenticated" on public.lobby_members
    for
select using (auth.role() = 'authenticated');

-- One live lobby per player: enforced in gd-lobby, indexed here for the lookup.
create index lobby_members_user_idx on public.lobby_members (user_id);

-- Live lobby UX: browsers and rooms update over Realtime.
alter
publication supabase_realtime add table public.lobbies;
alter
publication supabase_realtime add table public.lobby_members;
