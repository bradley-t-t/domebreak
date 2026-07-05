-- GoldenDome schema (isolated, additive, gd_-prefixed) in the shared project.
-- Clients READ match/city/result state under RLS for realtime rendering; all
-- writes go through the gd-match edge function (service role). Player secrets
-- and per-player placements are never client-readable (fog of war).
create
extension if not exists pgcrypto;

create table if not exists public.gd_players
(
    id
    uuid
    primary
    key
    default
    gen_random_uuid
(
),
    handle text not null,
    secret uuid not null default gen_random_uuid
(
),
    created_at timestamptz not null default now
(
)
    );

create table if not exists public.gd_matches
(
    id
    uuid
    primary
    key
    default
    gen_random_uuid
(
),
    code text not null unique,
    status text not null default 'lobby' check
(
    status
    in
(
    'lobby',
    'build',
    'combat',
    'done'
)),
    build_seconds int not null default 180,
    build_ends_at timestamptz,
    seed bigint not null default
(
    floor(
    random
(
) * 2147483647))::bigint,
    created_by uuid references public.gd_players
(
    id
) on delete set null,
    winner_player_id uuid references public.gd_players
(
    id
)
  on delete set null,
    created_at timestamptz not null default now
(
)
    );
create index if not exists gd_matches_code_idx on public.gd_matches(code);

create table if not exists public.gd_match_players
(
    match_id
    uuid
    not
    null
    references
    public
    .
    gd_matches
(
    id
) on delete cascade,
    player_id uuid not null references public.gd_players
(
    id
)
  on delete cascade,
    slot int not null,
    handle text not null,
    budget int not null default 1200,
    spent int not null default 0,
    ready boolean not null default false,
    home_lng double precision,
    home_lat double precision,
    primary key
(
    match_id,
    player_id
)
    );

create table if not exists public.gd_cities
(
    id
    uuid
    primary
    key
    default
    gen_random_uuid
(
),
    match_id uuid not null references public.gd_matches
(
    id
) on delete cascade,
    player_id uuid not null references public.gd_players
(
    id
)
  on delete cascade,
    name text not null,
    lng double precision not null,
    lat double precision not null,
    hp int not null default 100,
    alive boolean not null default true
    );
create index if not exists gd_cities_match_idx on public.gd_cities(match_id);

create table if not exists public.gd_placements
(
    id
    uuid
    primary
    key
    default
    gen_random_uuid
(
),
    match_id uuid not null references public.gd_matches
(
    id
) on delete cascade,
    player_id uuid not null references public.gd_players
(
    id
)
  on delete cascade,
    kind text not null check
(
    kind
    in
(
    'silo',
    'interceptor',
    'radar',
    'dome'
)),
    lng double precision not null,
    lat double precision not null,
    target_city_id uuid references public.gd_cities
(
    id
)
  on delete set null,
    cost int not null default 0,
    created_at timestamptz not null default now
(
)
    );
create index if not exists gd_placements_match_player_idx on public.gd_placements(match_id, player_id);

create table if not exists public.gd_results
(
    match_id
    uuid
    primary
    key
    references
    public
    .
    gd_matches
(
    id
) on delete cascade,
    winner_player_id uuid references public.gd_players
(
    id
)
  on delete set null,
    summary jsonb not null default '{}'::jsonb,
    replay jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now
(
)
    );

alter table public.gd_players enable row level security;
alter table public.gd_matches enable row level security;
alter table public.gd_match_players enable row level security;
alter table public.gd_cities enable row level security;
alter table public.gd_placements enable row level security;
alter table public.gd_results enable row level security;

-- Client-readable game state (no sensitive data). Writes have no client policy,
-- so only the service-role edge function can mutate.
drop
policy if exists gd_matches_read on public.gd_matches;
create
policy gd_matches_read on public.gd_matches for
select using (true);
drop
policy if exists gd_match_players_read on public.gd_match_players;
create
policy gd_match_players_read on public.gd_match_players for
select using (true);
drop
policy if exists gd_cities_read on public.gd_cities;
create
policy gd_cities_read on public.gd_cities for
select using (true);
drop
policy if exists gd_results_read on public.gd_results;
create
policy gd_results_read on public.gd_results for
select using (true);
-- Intentionally NO select policy on gd_players (protects secret) or
-- gd_placements (fog of war): those are edge-function-only.

-- Realtime for live lobby/phase/ready/result updates (additive to publication).
do
$$
begin
begin
execute 'alter publication supabase_realtime add table public.gd_matches';
exception when duplicate_object then null;
end;
begin
execute 'alter publication supabase_realtime add table public.gd_match_players';
exception when duplicate_object then null;
end;
begin
execute 'alter publication supabase_realtime add table public.gd_cities';
exception when duplicate_object then null;
end;
begin
execute 'alter publication supabase_realtime add table public.gd_results';
exception when duplicate_object then null;
end;
end$$;
