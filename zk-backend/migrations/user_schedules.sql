-- Horarios por usuario (ZK-teco)
-- Ejecutar en el SQL Editor de Supabase. La tabla es opcional:
-- el backend funciona con fallback local (user_schedules.json) si no existe.
create table if not exists public.user_schedules (
  user_id bigint primary key,
  days jsonb not null default '[]'::jsonb,
  late_minutes int,
  end_minutes int,
  off_dates jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);