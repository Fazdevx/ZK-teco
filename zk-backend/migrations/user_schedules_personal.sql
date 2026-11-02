-- Personal: área/cargo y turno por usuario (ZK-teco)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de user_schedules.sql.
-- Ambas columnas son opcionales: si no existen, el backend sigue funcionando
-- y guarda área/turno solo en el JSON local (user_schedules.json).
alter table public.user_schedules
  add column if not exists area text;

alter table public.user_schedules
  add column if not exists shift text;
