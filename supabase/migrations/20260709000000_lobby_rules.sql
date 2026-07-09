-- Shared match rules the lobby authors before launch. Any seated member may
-- write via db-lobby's set_rules action; the server reads this column when
-- claiming the lobby and threads it into the Match's buildSetup. Nullable so
-- existing rows keep working — code paths fall back to DEFAULT_RULES.
alter table if exists public.lobbies
    add column if not exists rules jsonb;
