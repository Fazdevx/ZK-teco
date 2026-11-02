-- Justificaciones de inasistencia/tardanza (ZK-teco)
-- Ejecutar en el SQL Editor de Supabase. La tabla es opcional:
-- el backend funciona con fallback local (user_excuses.json) si no existe.
-- Una justificación por persona y día: clasifica el día como justificado
-- (licencia, permiso, comisión, vacaciones, remoto, onisión, capacitación, otro).
create table if not exists public.attendance_excuses (
  id bigint generated always as identity primary key,
  user_id bigint not null,
  day text not null,
  excuse_type text not null default 'otro',
  document text,
  note text,
  covers_late boolean not null default true,
  created_at timestamptz not null default now(),
  constraint attendance_excuses_user_day unique (user_id, day)
);

create index if not exists attendance_excuses_day_idx
  on public.attendance_excuses (day);
