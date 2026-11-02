-- Tabla para almacenar el grado/grupo de cada usuario.
-- Esto reemplaza al archivo local user_groups.json que solo se sembraba una vez
-- y causaba que los grados se perdieran en el .exe al crear/editar usuarios.

create table if not exists public.user_grades (
  user_id  integer primary key references public.users(id) on delete cascade,
  grade    text not null default 'General',
  updated_at timestamptz not null default now()
);

-- Habilitar RLS (igual que la tabla users) y permitir acceso al service role.
alter table public.user_grades enable row level security;

-- El backend usa la service role key, que bypasea RLS. No se necesitan policies.
-- Si en el futuro se quiere exponer al frontend con anon key, agregar policies aquí.

-- Índice por grade para acelerar filtros del dashboard/report.
create index if not exists user_grades_grade_idx on public.user_grades (grade);
