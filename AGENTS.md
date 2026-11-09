# ZK-teco — Attendance System

## Overview

A biometric attendance system that syncs with ZKTeco fingerprint devices and stores data in Supabase. Frontend is a React SPA, backend is an Express API.

## Project Structure

```
zk-teco/
├── .env                          # Root device IP/port override
├── zk-backend/
│   ├── index.js                  # Express API server (port 5000)
│   ├── lib/logic.js              # Pure logic: dates/tz, punches, tardanzas, doble marcación, day summaries (unit-tested)
│   ├── test/logic.test.js        # `node:test` suite for lib/logic.js
│   ├── settings.json             # Late/work-hour rules (persisted to disk)
│   ├── scripts/extract-today.js  # CLI script to pull & display today's logs
│   └── package.json              # CommonJS; `npm test` → node --test
├── zk-frontend/
│   ├── src/
│   │   ├── main.jsx              # React entry
│   │   ├── App.jsx               # Router + sidebar + sync button (global)
│   │   ├── Dashboard.jsx         # Stats cards, progress bars, late/early lists, weekly trend
│   │   ├── Attendance.jsx        # Log table with filter (today/week/all)
│   │   ├── Users.jsx             # User list + per-user detail with history
│   │   ├── Horarios.jsx          # Per-user schedules: days, entry limit, exit time, no-laborables (bulk edit)
│   │   ├── index.css             # Tailwind v4 + Inter font + custom gradients/animations
│   │   ├── lib/excelReport.js     # Generador del Excel del reporte (xlsx-js-style, con estilos/color)
│   │   ├── lib/schoolTime.js      # Fechas/horas siempre en la zona horaria del colegio
│   │   └── lib/supabaseClient.js  # Supabase client (anon key, unused in components)
│   ├── vite.config.js            # React + Tailwind CSS v4 plugin
│   └── eslint.config.js          # ESLint flat config (JSX, react-hooks, react-refresh)
```

## Commands

| Context | Command | Description |
|---------|---------|-------------|
| Backend | `npm run dev` | Start with nodemon (auto-reload) |
| Backend | `npm start` | Start with `node index.js` |
| Backend | `npm run extract-today` | CLI: pull today's logs from device to terminal + Supabase |
| Backend | `npm run clear-resync` | Clear `attendance_logs` + full re-sync from device (uses corrected UTC conversion) |
| Backend | `npm test` | Run `node --test` on `test/*.test.js` (lib/logic.js) |
| Frontend | `npm run dev` | Vite dev server (HMR) |
| Frontend | `npm run build` | Production build to `dist/` |
| Frontend | `npm run preview` | Preview production build |
| Frontend | `npm run lint` | ESLint on all JS/JSX files |

## Architecture & Data Flow

1. **ZKTeco device** → `zklib-ng` library → backend API
2. **Backend API** (`zk-backend/index.js`) → `@supabase/supabase-js` → Supabase PostgreSQL
3. **Frontend** (React SPA) → fetches `http://localhost:5000/api/*` → renders Tailwind UI

### API Endpoints (all under `/api`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/settings` | GET | Read late/work-hour rules (frontend only reads `tzOffsetMinutes`; **POST removed** — settings are edited in `settings.json`/`app_settings` by a technician) |
| `/sync/users` | POST | Pull users from device, upsert to Supabase |
| `/sync/attendance` | POST | Pull users + attendance logs, upsert both |
| `/data/attendance?filter=today|week|all` | GET | Enriched logs with punch_type & status (**POST/PUT/DELETE removed** — attendance is read-only) |
| `/data/users` | GET | User list (id, name) |
| `/data/users/:id/detail` | GET | User stats + day-by-day summaries |
| `/data/dashboard` | GET | Today stats, weekly trend, late/early lists |
| `/data/report?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=N` | GET | Per-user daily summaries for printable report |
| `/data/users/:id/calendar` | GET | Per-user daily summaries for a calendar month |
| `/data/users/:id/schedule` | GET/POST | Read/update one user's schedule (`{ days, lateTime, endTime, offDates, area, shift }`; `{ clear: true }` removes it) |
| `/data/schedules` | GET | Map of `userId → schedule` for all users |
| `/data/schedules/batch` | POST | Bulk apply/clear schedules `{ userIds, days?, lateTime?, endTime?, offDates?, area?, shift?, clear? }` |
| `/data/excuses?from=&to=&userId=` | GET | Justificaciones (licencias/permisos…) del período (**POST/DELETE removed** — read-only; manage via Supabase/local JSON) |
| `/device/users` | POST | Create user on ZKTeco device (`{ userId, name }`) |
| `/device/users/:id` | DELETE | Delete user from device + Supabase (including attendance logs) |
| `/device/enroll` | POST | Enroll fingerprint on device (`{ userId, fingerId? }`) |

> **Modo estándar (sin admin)**: se eliminaron el modo admin de Asistencias (editar/borrar marcaciones), la página Ajustes (`Settings.jsx` borrada), el alta/baja de justificaciones con `x-admin-password`, el endpoint `/admin/verify`, `checkAdminPassword` y `settings.adminPassword`. El sistema es de solo consulta; ver `MANUAL_DE_USUARIO.md`.

### Key Logic in Backend

- **Punch type**: `getPunchType()` — hour < 12 = `entry`, >= 12 = `exit` (simple, assumes no night shifts)
- **Late status**: `getStatus()` — compares first punch of the day against `lateHour:lateMinute + toleranceMinutes`
- **Day summaries**: `buildDaySummaries()` — groups logs by day, sorts, takes first/last as check-in/check-out, computes hours worked
- **Doble marcación**: `groupDoubleTaps()` agrupa marcas consecutivas del mismo usuario-mismo-día separadas por ≤ `doubleTapToleranceMinutes` (default 1; setting en `settings.json`, editado por un técnico). Se conserva la PRIMERA del grupo; las demás se marcan `isDuplicate`. Toda etiqueta/clasificación/horas usa la secuencia "colapsada", así un doble toque ya no corre las posiciones (una 2ª huella de entrada ya no se vuelve "salida a refrigerio"). Días con dobles absorbidas o con >4 marcas efectivas llevan `needsReview`+`reviewReason` (reporte, detalle por mes, `buildDaySummaries`) y el reporte expone `reviewDays`/totals.toReview.
- **Día "a revisar"**: `needsReview`+`reviewReason` se dispara por doble marcación absorbida, >4 marcas efectivas, o marca de madrugada (antes de las 4:00 AM hora del colegio — típica de otra caja/PC con zona horaria errada). Las marcas de madrugada NO definen el estado: `firstEffectivePunch()` salta a la primera marca plausible (≥ 4:00) y clasifica con esa, dejando `reviewReason='Marca sospechosa'`.
- **Reporte imprimible/exportable**: `Report.jsx` construye el documento en una función `buildDocument()` reusable por Impresión y PDF, con dos formatos elegibles (persistidos en `localStorage['report-doc-config'].pdfFormat`, default `detallado`):
  - `detallado` — carátula con resumen consolidado + firmas y una hoja completa por persona (asistencia diaria, inasistencias, indicadores).
  - `consolidado` — un solo documento que fluye entre páginas (`.doc-flow`, sin `page-break-after`): tira de indicadores, tabla "lista" de una fila por persona con columnas que se adaptan al filtro activo (con `onlyAbsent` → `LISTA DE INASISTENCIAS`: N°, persona, grupo, inasistencias, fechas, días, tardanzas), tabla "Inasistencias por fecha" (`getAbsencesByDay()`: una línea por día con el N° y la lista de nombres), anexo de tardanzas (una fila por evento: fecha, día, límite → llegada, minutos) y resumen por grado. Encabezados de tabla se repiten en cada página vía `thead { display: table-header-group }`.
Exporta además Excel `.xlsx` (`xlsx-js-style`, lazy) y CSV (BOM + `;`). Marca del documento configurable en pantalla. El toggle "marcaciones detalladas" suma la columna "Marcaciones" usando `day.marks` (secuencia efectiva tras colapsar dobles toques) expuesto por `/api/data/report`. Los emojis solo aparecen en la UI de pantalla, nunca en el documento.
- **Excel del reporte** (`zk-frontend/src/lib/excelReport.js`): el libro se arma con `xlsx-js-style` (fork de SheetJS que sí escribe el atributo `s` de cada celda; la versión community de `xlsx` descarta los estilos, por eso se quitó esa dependencia). Reglas de formato: las columnas de día llevan la abreviatura del día de la semana encima de la fecha (`L` / `1/09` en dos líneas con `wrapText`, helpers `dayLabel()` y `dayHeadLabel()`; solo el domingo lleva encabezado gris y abreviatura `D`), las horas siempre `hh:mm` (`hm()`, `hmFromHours()`), la celda con marca muestra únicamente la hora y el resto se ve por color — ámbar = tardanza, rojo = falta sin justificar (`F`), azul = falta justificada (`FJ`), lila = día a revisar —, columna `Total tardanzas (min)` por persona y fila `TOTALES` al pie (presentes por día + suma de tardanzas e inasistencias), más una fila de leyenda combinada fuera del autofiltro. Estilo común: encabezado oscuro con texto blanco, bordes finos, bandas alternas, números centrados con formato `0`, autofiltro, anchos y alto de fila. Hojas: `Asistencia` (molde matricial), `Resumen`, `Detalle diario` y, con planilla, `Planilla RR.HH.`, `Justificaciones`, `Resumen por área`.
- **Sábados: solo el Excel los cuenta** — `getFilteredReport(opts)` en `Report.jsx` recorta `user.days` a lun–vie por defecto (pantalla, impreso/PDF y CSV), y el exportador Excel pasa `{ saturdays: true }` para que las marcas de sábado entren en el molde, `Resumen`, `Detalle diario`, `Minutos tarde` y la planilla (el domingo nunca cuenta: `isMonFri`/`isMonSat` + `dowOfDate`). `getPayrollRows/getPayrollTotals/getByArea` aceptan el mismo `opts` para que las filas de planilla del Excel coincidan con sus usuarios.
- **Justificaciones (RR.HH.)**: una por persona+día (clave única `user_id+day`) en la tabla `attendance_excuses` (`id`, `user_id`, `day text`, `excuse_type`, `document`, `note`, `covers_late`) con fallback local `user_excuses.json`. Tipos (`EXCUSE_TYPES`/`EXCUSE_LABELS` en lib/logic.js): `licencia, permiso, comision, vacaciones, remoto, onision, capacitacion, otro` — `stripAccents` + `normalizeExcuseType` aceptan variantes escritas ("Mañana", "comisión"). No borran la inasistencia: la reclasifican. `coversLate` (default `true`) exonera los minutos de tardanza de ese día. El alta/baja de justificaciones desde la UI fue eliminada (solo lectura); se registran directamente en Supabase o en `user_excuses.json`.
- **Planilla / control de turno del personal**: `buildPayrollSummary({ days, absentDays, excuses, expectedDays, schedule, settings })` (lib/logic.js) es la fuente de todos los indicadores por persona. `getWorkedMinutes(marks)` = permanencia (última − primera marca, SIN descontar descansos; la resta de refrigerio vive en `hoursWorked`); `getExpectedWorkMinutes(schedule, settings)` = jornada esperada (turno propio o `workStart*`/`workEnd*` globales) y devuelve `null` si no hay salida definida ⇒ `compliancePct` sale `null`; `getExtraMinutes` = lo que se pasa de la hora de salida. `splitAbsencesByExcuse` parte las faltas en justificadas/injustificadas. `/api/data/report` expone por usuario `area, shift, expectedDays, expectedMinutes, workedDays, workedMinutes, workedTime, workedHours, extraMinutes, extraTime, compliancePct, justifiedAbsence(s|Count), unjustifiedAbsence(s|Count), lateMinutesCharged, lateMinutesExcused, excusedLateDays, excuses` y en `totals` las mismas sumas.
- **Reporte de personal (RR.HH.)**: en `Report.jsx`, `showPayroll = filters.showPayroll && audience.kind !== 'alumnos'` (los reportes de alumnos no muestran planilla). Agrega: tarjeta de justificaciones (solo lectura; el alta/baja fue eliminada), tabla de planilla con fila TOTALES, resumen y **acta con firmas por área** (`getByArea()`, área = `schedule.area` o el grado), columna "Just. / Sin just." en las listas, anexo de tardanzas con columna "Justificada", y en Excel hojas extra `Planilla RR.HH.`, `Justificaciones`, `Resumen por área`. Filtro "Solo sin justificar" (`onlyUnjustified`). El acta por áreas también reemplaza el bloque de firmas genérico en la carátula.
- **Doble pantalla de puntualidad**: `audience.showPunctuality` (false solo para el público "Docentes / Personal") manda en hoja detallada, CSV, Excel y tablas — no se cuela la columna "Puntualidad" donde el backend no la usa.
- **Clasificación precisa (descuentos)**: la frontera on-time/late se compara EXACTA al segundo (`getSchoolTotalSeconds`: 1 s después del límite ya es tardanza; la hora exacta = a tiempo). `getLateMinutes` cuenta MINUTOS COMPLETOS (floor): 07:35:59 → 0, 07:36:00 → 1. `toleranceMinutes` aplica por igual entre semana y sábados. La inasistencia solo cuenta con marca >= `absenceAfterHour` (23:00 en dev ⇒ solo "sin marca" = falta) o falta total de marca.
- **Batch upsert**: Attendance logs upserted in chunks of 500 rows to avoid Supabase timeouts
- **Horarios por usuario**: opcional por usuario. `getUserSchedule(userId)` (wrap-safe, vacío si no hay) define qué días asiste, límite de entrada y hora de salida propios, y fechas "no laborables" (claves `YYYY-MM-DD` en zona del colegio). Sin horario → regla general (lun-vie + `settings.json`). `isExpectedWorkDaySync(sched, dow, offDates)` decide si un día es laborable (marca en día NO esperado no genera falta; si marcó igual cuenta como presente). `getUserDayLimits/getUserDayStatus/getUserLateMinutes/getUserEndTotal` usan `sched.lateMinutes/endMinutes` (minutos desde 00:00) con fallback a la config global. `buildDaySummaries(logs, settings, schedule)` clasifica con límites personales. Respuestas de reporte, detalle, calendario, dashboard y asistencias incluyen `schedule` (API: `days` ints 0-6 `getUTCDay`, `lateTime`/`endTime` "HH:MM", `area`, `shift`). El `POST` de horario hace **merge parcial** (solo los campos presentes del body), así `offDates: []` sí limpia. `Horarios.jsx` edita área/turno por fila y en bloque.
- **Supabase caps reads at 1000 rows**: any `.from('attendance_logs').select()` without pagination silently truncates → missing marks = false absences in reports/summaries. Use the `fetchAllRows(buildQuery)` helper (pages of 1000 via `.range()`); applied in `/data/report`, `/data/dashboard` weekly trend, and the incidents endpoint. The `/data/attendance` list keeps its intentional "most recent 1000" behavior.
- **Settings**: stored in a local `settings.json` file (not in Supabase)
- **Schedules storage**: tabla Supabase `user_schedules` (`user_id bigint PK, days jsonb, late_minutes int, end_minutes int, off_dates jsonb, updated_at`) + fallback local `user_schedules.json` en el mismo dir del backend + caché `scheduleCache` (patrón `user_groups`/`user_grades`). La tabla debe crearse manualmente en Supabase:
  ```sql
  create table if not exists public.user_schedules (
    user_id bigint primary key,
    days jsonb not null default '[]'::jsonb,
    late_minutes int,
    end_minutes int,
    off_dates jsonb not null default '[]'::jsonb,
    updated_at timestamptz default now()
  );
  ```
   `persistSchedule` y `loadSchedulesFromDb` toleran que la tabla falte (log + fallback a JSON), así que el sistema funciona aunque la tabla no exista. Desde la versión de personal la tabla tiene además `area text` y `shift text` (`manana|tarde|noche`): si esas columnas no existen, `loadSchedulesFromDb` reintenta con el SELECT legacy (`scheduleExtraColumns=false`) y conserva área/turno desde el JSON local (logSuggest + merge en `loadSchedulesFromDb`).
- **Migraciones SQL** (`zk-backend/migrations/`, se ejecutan a mano en el SQL Editor de Supabase; ambas son opcionales porque hay fallback local):
  - `user_schedules.sql` — crea `user_schedules`.
  - `user_schedules_personal.sql` — `alter table ... add column if not exists area text, shift text`.
  - `attendance_excuses.sql` — crea `attendance_excuses` con `unique (user_id, day)` (necesario para el `onConflict` del POST).

## Conventions

- **Language**: Spanish UI (labels, messages, error strings)
- **Backend**: CommonJS (`require`/`module.exports`), no TypeScript
- **Frontend**: ES modules, JSX, no TypeScript
- **API responses**: Envelope format `{ success: boolean, data?: any, message?: string, count?: number }`
- **CSS**: Tailwind CSS v4 utility classes exclusively (no separate CSS files — `App.css` is a placeholder)
- **Gradients**: Named utility classes defined in `index.css` (`.gradient-blue`, `.gradient-green`, etc.)
- **Animations**: `.animate-fade-in` and `.animate-slide-up` classes in `index.css`
- **Font**: Inter via `@fontsource/inter` (weights 400-800)
- **Component API**: All pages receive `setError` prop; some receive `setSuccess` — errors/success displayed in App.jsx header bar
- **Sync button**: Lives in the App.jsx sidebar header, passed down to Dashboard as `onSync` prop
- **API URL**: `VITE_API_URL` env var, defaults to `http://localhost:5000/api`

## Gotchas

- **Backend `package.json` has `"type": "commonjs"`** — don't use `import`/`export` in backend files
- **No test framework** — `npm test` just exits with code 1. Any testing must be added manually.
- **`zklib-ng` is the device library** — provides `ZKDevice` with `.connect()`, `.users.list()`, `.attendance.list()`, `.disconnect()`. Always handle disconnect in `finally`/catch blocks.
- **Device env vars** are in three places: `zk-backend/.env` (DEVICE_IP, DEVICE_PORT, DEVICE_PASSWORD) and root `.env` (DEVICE_IP, DEVICE_PORT) and `.env` root overrides — the root `.env` is NOT loaded by the backend (only `zk-backend/.env` is). The root `.env` appears unused.
- **Supabase key exposure**: The frontend `.env` contains both an anon key and a service role key. The service role key should NOT be in the client bundle — it's already exposed in this codebase.
- **Punch type heuristic** (`schoolTotal < 12:00 = entry`) is naive — won't work for night shifts crossing midnight. `getPunchType` would still mark a 1 AM checkout as `entry`. It now runs on the fixed school timezone (see below), not server wall-clock.
- **`buildDaySummaries`** assumes first log of the day is check-in and last is check-out; with 4+ marks it subtracts the lunch segment (`(m1-m0)+(m3-m2)`) and caps `hoursWorked` at `MAX_WORK_HOURS` (16) — anything above that is reported `null` as anomalous data. Since the doble-marcación fix, all day analyses collapse near-duplicate marks FIRST (`groupDoubleTaps`), so `totalChecks`/`hoursWorked`/labels reflect the effective sequence.
- **School timezone**: ALL date/hour logic (day keys, statuses, late minutes, ranges, workday lists, report/dashboard/calendar/incidents) runs on a fixed fixed school offset — `settings.tzOffsetMinutes` (default `-300` = Peru UTC-5) or env `SCHOOL_TZ_OFFSET_MINUTES`. Marks are stored as real UTC instants (`check_time`) in Supabase; never interpret them with the server's local wall clock. Helpers: `getSchoolOffsetMinutes`, `toSchoolDate`, `getSchoolTotal`, `getDayKey`, `dateStrToSchoolInstant`, `listSchoolDates`. Saturday is NOT a workday — only Mon–Fri count for absences (`dow !== 0 && dow !== 6`).
- **Device timestamps are normalized at WRITE time**: `zklib-ng`'s `decodeTime` builds the Date with the backend PC's local zone, but the device's wall-clock fields are Peru time. Every path that stores `check_time` must go through `deviceTsToInstant(log.timestamp)` (`index.js`, `extract-today.js`, `clear-and-resync.js`) so writes don't depend on the PC's zone. Manual add/edit endpoints parse `YYYY-MM-DDTHH:mm` as school-local time (not server-local). The frontend renders times in the school zone via `src/lib/schoolTime.js` (applies the offset, ignores browser/PC zone); components call `loadSchoolOffset(API)` on mount.
- **`userCache` is cold until awaited**: `userCache.getMap()` is synchronous and returns `{}` if `userCache.get()` was never awaited (fresh start, TTL 5 min). Endpoints that build user maps must `await userCache.get()` first.
- **Horarios cold start**: igual que `userCache`, la caché `scheduleCache` arranca vacía hasta que se ejecuta `loadSchedulesFromDb()`. Endpoints que usan `getUserSchedulesSafe`/`getUserSchedule` deben `await` la carga antes de leer el mapa (ya integrado en reporte, detalle, dashboard, asistencias y calendario).
- **Two backends can coexist**: the production build (`C:\Users\fabri\AppData\Local\Programs\Asistencias Galileo\...\node-portable\node.exe`) usually occupies port 5000 and runs OLDER code. Dev backend takes `PORT` (default 5000). To test changes, run the dev backend on another port (e.g. `PORT=5001`) or rebuild the app.
- **Settings are local** — not synced to Supabase. Only the server running `zk-backend` has the current settings.
- **Empty state design**: All pages show a centered spinner during loading, then either a table or a "no data" illustration with an SVG icon.
- **Dashboard fetches user names** on mount (via `fetch(/data/users)`) but **does not re-fetch** when the user list changes — this is a stale-data bug.
- **`VITE_SUPABSE_SERVICE_ROLE_KEY`** is misspelled in `zk-frontend/.env` (missing `A` in `SUPABASE`). This key is not used anywhere in the frontend code.
- **Tailwind v4** uses `@import "tailwindcss"` in CSS (not `@tailwind` directives) and the `@tailwindcss/vite` plugin — this is the v4 API, not v3.
- **ESLint flat config** — uses `eslint.config.js` with `defineConfig` (ESLint v9+ API), not `.eslintrc`.
- **Enrollment flow**: `POST /api/device/users` creates the user on the device. Then `POST /api/device/enroll` starts fingerprint enrollment — the user must press their finger 3 times on the reader. The user MUST exist on the device before enrolling; the device rejects enrollment for unknown users.
- **`device.enroll.fingerprint()`** blocks until the user completes all 3 presses or times out — the endpoint will hang for the duration. Consider a longer timeout or background job for production use.
