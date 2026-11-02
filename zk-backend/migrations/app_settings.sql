-- Configuración global (límites de entrada/salida, zona horaria, contraseña admin…).
-- Necesaria para que los ajustes persistan en Vercel (filesystem efímero).
-- Si la tabla no existe, el backend usa settings.json local como fallback.
create table if not exists public.app_settings (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into public.app_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
