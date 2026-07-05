alter table public.gd_matches add column if not exists max_slots int not null default 2;
alter table public.gd_match_players add column if not exists is_ai boolean not null default false;
