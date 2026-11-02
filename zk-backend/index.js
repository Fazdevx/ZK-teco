require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { ZKDevice } = require('zklib-ng');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const {
  setSchoolTzOffset,
  toSchoolDate,
  getSchoolTotal,
  getPunchType,
  getPunchLabel,
  getDayLimits,
  getDayStatus,
  getLateMinutes,
  formatLateMinutes,
  getUserDayStatus,
  getUserLateMinutes,
  getUserEndTotal,
  isExpectedWorkDaySync,
  EXCUSE_TYPES,
  EXCUSE_LABELS,
  SHIFTS,
  SHIFT_LABELS,
  normalizeExcuseType,
  getExcuseLabel,
  normalizeShift,
  getShiftLabel,
  splitAbsencesByExcuse,
  getExpectedWorkMinutes,
  getWorkedMinutes,
  getExtraMinutes,
  buildPayrollSummary,
  getDayKey,
  dateStrToSchoolInstant,
  listSchoolDates,
  deviceTsToInstant,
  dedupeLogsByTimestamp,
  groupDoubleTaps,
  firstEffectivePunch,
  buildDaySummaries,
  MAX_WORK_HOURS
} = require('./lib/logic');

const app = express();
const port = process.env.PORT || 5000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// DATA_DIR la pasa Electron en producción (carpeta escribible en AppData).
// En desarrollo usa __dirname (la carpeta del backend).
// En Vercel (serverless) solo /tmp es escribible; los JSON de semilla se copian allí.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = process.env.DATA_DIR
  || (IS_SERVERLESS ? path.join(os.tmpdir(), 'zk-teco-data') : __dirname);

const USER_GROUPS_PATH = path.join(DATA_DIR, 'user_groups.json');
const DEFAULT_GRADES = [
  '3° Secundaria - A',
  '3° Secundaria - B',
  '4° Secundaria - A',
  '4° Secundaria - B',
  '5° Secundaria',
  'Docentes / Personal',
  'General'
];

const SEED_USER_GROUPS_PATH = path.join(__dirname, 'user_groups.json');

function seedUserGroupsIfMissing() {
  if (fs.existsSync(USER_GROUPS_PATH)) return;
  if (!fs.existsSync(SEED_USER_GROUPS_PATH)) return;
  try {
    fs.mkdirSync(path.dirname(USER_GROUPS_PATH), { recursive: true });
    const seed = fs.readFileSync(SEED_USER_GROUPS_PATH, 'utf8');
    fs.writeFileSync(USER_GROUPS_PATH, seed);
    console.log('[Backend] user_groups.json sembrado desde', SEED_USER_GROUPS_PATH);
  } catch (err) {
    console.error('[Backend] No se pudo sembrar user_groups.json:', err.message);
  }
}

function getUserGroups() {
  seedUserGroupsIfMissing();
  try {
    return JSON.parse(fs.readFileSync(USER_GROUPS_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveUserGroups(groups) {
  try {
    fs.writeFileSync(USER_GROUPS_PATH, JSON.stringify(groups, null, 2));
  } catch (err) {
    console.error('Error saving user groups:', err.message);
  }
}

// ── Grade storage (Supabase-backed, JSON fallback) ────────────────────────────
// Los grados se guardan en la tabla `user_grades` de Supabase (fuente de verdad).
// El archivo user_groups.json se mantiene solo como fallback y para sembrar la
// tabla la primera vez (migración). Esto soluciona el bug donde en el .exe
// instalado los grados se perdían y todos quedaban en "General".
let gradesCache = null; // { userId: grade }

async function loadGradesFromDb() {
  try {
    const { data, error } = await supabase
      .from('user_grades')
      .select('user_id, grade');
    if (error) throw error;
    const map = {};
    (data || []).forEach(row => { map[row.user_id] = row.grade; });
    gradesCache = map;
    return map;
  } catch (err) {
    console.error('[Backend] No se pudieron cargar grados desde Supabase:', err.message);
    return null;
  }
}

async function getUserGradesAsync() {
  if (gradesCache) return gradesCache;
  const fromDb = await loadGradesFromDb();
  // Si la DB devolvió datos, los usamos (puede ser {} si la tabla está vacía).
  // Si la query falló (null), caemos al JSON local.
  if (fromDb !== null) return fromDb;
  // Fallback: leer del JSON local si la DB no responde
  return getUserGroups();
}

// Wrapper que garantiza siempre un objeto (nunca null) con fallback en cascada:
// cache en memoria -> tabla user_grades en Supabase -> JSON local -> {} (todos General)
async function getUserGradesSafe() {
  const grades = await getUserGradesAsync();
  return grades && typeof grades === 'object' ? grades : {};
}

async function migrateLocalGradesToDb() {
  try {
    // Contar cuántos registros tiene la tabla actualmente
    const { count, error } = await supabase
      .from('user_grades')
      .select('user_id', { count: 'exact', head: true });
    if (error) throw error;

    // Si la tabla ya tiene datos, asumir migración completa y salir.
    if (count && count > 0) {
      console.log(`[Backend] user_grades ya tiene ${count} registros, se omite migración`);
      return;
    }

    const local = getUserGroups();
    const entries = Object.entries(local);
    if (entries.length === 0) {
      console.log('[Backend] No hay grados locales para migrar');
      return;
    }

    const rows = entries.map(([userId, grade]) => ({
      user_id: parseInt(userId),
      grade: grade || 'General'
    }));

    const { error: upErr } = await supabase
      .from('user_grades')
      .upsert(rows, { onConflict: 'user_id' });
    if (upErr) throw upErr;
    console.log(`[Backend] Migrados ${rows.length} grados desde user_groups.json a Supabase`);
  } catch (err) {
    console.error('[Backend] Migración de grados falló:', err.message);
  }
}

async function setUserGrade(userId, grade) {
  const finalGrade = grade || 'General';
  // Actualizar en memoria
  if (!gradesCache) gradesCache = {};
  gradesCache[userId] = finalGrade;

  // Persistir en Supabase (fuente de verdad)
  try {
    const { error } = await supabase
      .from('user_grades')
      .upsert(
        { user_id: userId, grade: finalGrade, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
  } catch (err) {
    console.error('[Backend] Error guardando grado en Supabase:', err.message);
  }

  // Mantener el JSON local sincronizado como respaldo
  const groups = getUserGroups();
  groups[userId] = finalGrade;
  saveUserGroups(groups);
}

// ── Schedules (horarios personales) ────────────────────────────────────────
// Cada usuario puede tener su horario: días de la semana que asiste, hora
// límite de ENTRADA propia, hora de SALIDA propia y fechas puntuales "no
// laborables" (feriados, permisos, cierre). Si un usuario no tiene horario se
// mantiene la regla general (lun-vie + config global): nada cambia.
// Se guardan en la tabla `user_schedules` de Supabase (fuente de verdad) con
// fallback local `user_schedules.json`, igual que los grados.
const USER_SCHEDULES_PATH = path.join(DATA_DIR, 'user_schedules.json');
let scheduleCache = null; // { userId: { days, lateMinutes, endMinutes, offDates } }

function normalizeSchedule(s) {
  if (!s) return null;
  const days = Array.isArray(s.days)
    ? s.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  const offDates = Array.isArray(s.offDates)
    ? [...new Set(s.offDates.map(String).filter(od => /^\d{4}-\d{2}-\d{2}$/.test(od)))]
    : [];
  const lateMinutes = s.lateMinutes != null && !Number.isNaN(Number(s.lateMinutes))
    ? Number(s.lateMinutes) : null;
  const endMinutes = s.endMinutes != null && !Number.isNaN(Number(s.endMinutes))
    ? Number(s.endMinutes) : null;
  const area = s.area != null ? String(s.area).trim().slice(0, 80) : '';
  const shift = normalizeShift(s.shift);
  return { days, lateMinutes, endMinutes, offDates, area, shift };
}

function minutesToHM(total) {
  if (total == null || Number.isNaN(total)) return null;
  const v = Number(total);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

function parseTimeToMinutes(t) {
  if (t == null || t === '') return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return (v >= 0 && v < 1440) ? v : null;
}

function scheduleToApi(s) {
  if (!s) return null;
  return {
    days: s.days || [],
    lateTime: s.lateMinutes != null ? minutesToHM(s.lateMinutes) : null,
    endTime: s.endMinutes != null ? minutesToHM(s.endMinutes) : null,
    offDates: s.offDates || [],
    area: s.area || '',
    shift: s.shift || null
  };
}

function getLocalUserSchedules() {
  try {
    const raw = JSON.parse(fs.readFileSync(USER_SCHEDULES_PATH, 'utf8')) || {};
    const map = {};
    Object.entries(raw).forEach(([uid, s]) => {
      const n = parseInt(uid, 10);
      if (Number.isInteger(n)) map[n] = normalizeSchedule(s);
    });
    return map;
  } catch { return {}; }
}

function saveLocalUserSchedules(map) {
  try {
    const out = {};
    Object.entries(map).forEach(([k, s]) => { if (s) out[k] = normalizeSchedule(s); });
    fs.writeFileSync(USER_SCHEDULES_PATH, JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('Error saving user schedules:', err.message);
  }
}

// La tabla `user_schedules` puede no tener todavía las columnas `area`/`shift`
// (migración opcional). Si el SELECT con ellas falla se reintenta con el juego
// legacy y las columnas nuevas quedan solo en el JSON local, sin perder datos.
let scheduleExtraColumns = true;
const SCHEDULE_SELECT = 'user_id, days, late_minutes, end_minutes, off_dates';
const SCHEDULE_SELECT_FULL = `${SCHEDULE_SELECT}, area, shift`;

async function loadSchedulesFromDb() {
  try {
    let query = supabase.from('user_schedules').select(
      scheduleExtraColumns ? SCHEDULE_SELECT_FULL : SCHEDULE_SELECT
    );
    let { data, error } = await query;
    if (error && scheduleExtraColumns) {
      scheduleExtraColumns = false;
      query = supabase.from('user_schedules').select(SCHEDULE_SELECT);
      ({ data, error } = await query);
      console.warn('[Backend] user_schedules no tiene las columnas area/shift: ejecuta migrations/user_schedules_personal.sql. Se conservan en el JSON local.');
    }
    if (error) throw error;
    const map = {};
    (data || []).forEach(row => {
      map[row.user_id] = normalizeSchedule({
        days: row.days || [],
        lateMinutes: row.late_minutes,
        endMinutes: row.end_minutes,
        offDates: row.off_dates || [],
        area: row.area || '',
        shift: row.shift || null
      });
    });
    // Sin las columnas area/shift en la DB, esas se conservan desde el JSON local
    // (y las filas que solo existen allí se agregan) para no perder datos.
    if (!scheduleExtraColumns) {
      Object.entries(getLocalUserSchedules()).forEach(([uid, s]) => {
        if (!s) return;
        const id = Number(uid);
        if (map[id]) {
          if (!map[id].area && s.area) map[id].area = s.area;
          if (!map[id].shift && s.shift) map[id].shift = s.shift;
        } else {
          map[id] = s;
        }
      });
    }
    scheduleCache = map;
    return map;
  } catch (err) {
    console.error('[Backend] No se pudieron cargar horarios desde Supabase:', err.message);
    return null;
  }
}

async function getUserSchedulesAsync() {
  if (scheduleCache) return scheduleCache;
  const fromDb = await loadSchedulesFromDb();
  if (fromDb !== null) return fromDb;
  return getLocalUserSchedules();
}

async function getUserSchedulesSafe() {
  const s = await getUserSchedulesAsync();
  return s && typeof s === 'object' ? s : {};
}

async function getUserSchedule(userId) {
  const map = await getUserSchedulesSafe();
  return map[userId] || null;
}

// ¿El día (dow del colegio + clave escolar) era laborable para este usuario?
// (isExpectedWorkDaySync, getUserDayStatus, getUserEndTotal... viven en
// lib/logic.js y se prueban con `npm test`.)

// ── Justificaciones (licencias, permisos, comisiones, vacaciones…) ───────────
// Una justificación por persona y día (clave única user_id+day). Marca el día
// como justificado: la inasistencia sigue apareciendo en el reporte pero
// clasificada como JUSTIFICADA, y si `coversLate` también exonera los minutos
// de tardanza de ese día. Supabase es la fuente de verdad; si la tabla no existe
// se usa el archivo local `user_excuses.json` (mismo patrón que los horarios).
const USER_EXCUSES_PATH = path.join(DATA_DIR, 'user_excuses.json');
let excuseCache = null;

function normalizeExcuse(e) {
  if (!e) return null;
  const userId = parseInt(e.userId != null ? e.userId : e.user_id);
  const day = String(e.day != null ? e.day : e.date || '');
  if (!Number.isInteger(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return {
    userId,
    day,
    type: normalizeExcuseType(e.type || e.excuse_type),
    document: e.document != null ? String(e.document).trim().slice(0, 80) : '',
    note: e.note != null ? String(e.note).trim().slice(0, 300) : '',
    coversLate: e.coversLate != null ? !!e.coversLate : (e.covers_late != null ? !!e.covers_late : true),
    createdAt: e.createdAt || e.created_at || new Date().toISOString()
  };
}

function excuseToApi(e) {
  if (!e) return null;
  return {
    userId: e.userId,
    day: e.day,
    type: e.type,
    label: getExcuseLabel(e.type),
    document: e.document,
    note: e.note,
    coversLate: e.coversLate,
    createdAt: e.createdAt
  };
}

function getLocalExcuses() {
  try {
    const raw = JSON.parse(fs.readFileSync(USER_EXCUSES_PATH, 'utf8')) || [];
    return (Array.isArray(raw) ? raw : []).map(normalizeExcuse).filter(Boolean);
  } catch { return []; }
}

function saveLocalExcuses(list) {
  try {
    fs.writeFileSync(USER_EXCUSES_PATH, JSON.stringify(list.map(excuseToApi), null, 2));
  } catch (err) {
    console.error('Error guardando justificaciones:', err.message);
  }
}

async function loadExcusesFromDb() {
  const { data, error } = await supabase
    .from('attendance_excuses')
    .select('user_id, day, excuse_type, document, note, covers_late, created_at');
  if (error) throw error;
  const list = (data || []).map(normalizeExcuse).filter(Boolean);
  excuseCache = list;
  return list;
}

async function getExcusesAsync() {
  if (excuseCache) return excuseCache;
  try {
    const fromDb = await loadExcusesFromDb();
    if (fromDb !== null) return fromDb;
  } catch (err) {
    console.error('[Backend] No se pudieron cargar justificaciones desde Supabase:', err.message);
  }
  const local = getLocalExcuses();
  excuseCache = local;
  return local;
}

async function getExcusesSafe() {
  const list = await getExcusesAsync();
  return Array.isArray(list) ? list : [];
}

// Índice { [userId]: { [day]: excuse } } para consultar una persona o el lote.
function excuseIndex(list) {
  const idx = {};
  (list || []).forEach(e => {
    if (!e) return;
    if (!idx[e.userId]) idx[e.userId] = {};
    idx[e.userId][e.day] = e;
  });
  return idx;
}

async function upsertExcuse(excuse) {
  excuseCache = await getExcusesAsync();
  const others = excuseCache.filter(e => !(e.userId === excuse.userId && e.day === excuse.day));
  const next = [...others, excuse];
  try {
    const { error } = await supabase.from('attendance_excuses')
      .upsert({
        user_id: excuse.userId,
        day: excuse.day,
        excuse_type: excuse.type,
        document: excuse.document || null,
        note: excuse.note || null,
        covers_late: excuse.coversLate,
        created_at: excuse.createdAt
      }, { onConflict: 'user_id,day' });
    if (error) throw error;
  } catch (err) {
    console.error('[Backend] Error guardando justificación en Supabase:', err.message);
  }
  excuseCache = next;
  saveLocalExcuses(next);
  return excuse;
}

async function removeExcuse(userId, day) {
  excuseCache = await getExcusesAsync();
  const next = excuseCache.filter(e => !(e.userId === userId && e.day === day));
  try {
    const { error } = await supabase.from('attendance_excuses')
      .delete().eq('user_id', userId).eq('day', day);
    if (error) throw error;
  } catch (err) {
    console.error('[Backend] Error eliminando justificación de Supabase:', err.message);
  }
  excuseCache = next;
  saveLocalExcuses(next);
  return next.length;
}

// ── User Cache ──
const userCache = {
  data: null,
  lastFetch: 0,
  ttl: 5 * 60 * 1000, // 5 minutos

  async get() {
    const now = Date.now();
    if (this.data && (now - this.lastFetch) < this.ttl) {
      return this.data;
    }
    const groups = await getUserGradesSafe();
    // Fetch only needed fields
    const { data, error } = await supabase
      .from('users')
      .select('id, name')
      .order('name');

    if (!error && data) {
      this.data = data.map(u => ({
        ...u,
        grade: (groups && groups[u.id]) || 'General'
      }));
      this.lastFetch = now;
    }
    return this.data || [];
  },

  invalidate() {
    this.data = null;
    this.lastFetch = 0;
  },

  getMap() {
    const users = this.data || [];
    const map = {};
    users.forEach(u => { map[u.id] = u.name; });
    return map;
  },

  async getGradeMap() {
    const groups = await getUserGradesSafe();
    const map = {};
    Object.entries(groups).forEach(([uid, g]) => { map[parseInt(uid)] = g; });
    return map;
  }
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Carga los settings desde Supabase (si la tabla existe) una vez por instancia.
// En serverless cada cold start debe leer la fila para no usar defaults.
app.use(async (req, res, next) => {
  try { await ensureSettingsLoaded(); }
  catch (err) { console.error('[Backend] settings middleware:', err.message); }
  next();
});

// En Vercel no hay acceso a la red local del colegio ni procesos del SO.
// Fallar rápido (en vez de esperar el timeout del lector) con un mensaje claro.
if (IS_SERVERLESS) {
  app.use(['/api/sync', '/api/device'], (req, res) => {
    res.status(503).json({
      success: false,
      message: 'El lector ZKTeco solo es accesible desde el backend local. Ejecutá la sincronización/gestión del dispositivo en la instalación local.'
    });
  });
}

// ── Settings ──
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const INCIDENTS_PATH = path.join(DATA_DIR, 'incidents.json');

// Copia los JSON de semilla al DATA_DIR escribible (necesario en Vercel).
function seedRuntimeFiles() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (path.resolve(DATA_DIR) === path.resolve(__dirname)) return;
    const seedFiles = [
      'settings.json',
      'incidents.json',
      'user_groups.json',
      'user_schedules.json',
      'user_excuses.json'
    ];
    // Vercel puede reubicar el backend dentro del bundle; probamos las
    // ubicaciones habituales (junto al archivo, raíz del proyecto, api/).
    const seedDirs = [
      __dirname,
      path.join(process.cwd(), 'zk-backend'),
      path.join(process.cwd(), 'api', 'zk-backend')
    ];
    seedFiles.forEach(name => {
      const target = path.join(DATA_DIR, name);
      if (fs.existsSync(target)) return;
      const source = seedDirs
        .map(dir => path.join(dir, name))
        .find(candidate => fs.existsSync(candidate));
      if (source) fs.copyFileSync(source, target);
    });
  } catch (err) {
    console.error('[Backend] No se pudo preparar DATA_DIR:', err.message);
  }
}
seedRuntimeFiles();

const DEFAULT_SETTINGS = {
  lateHour: 8, lateMinute: 0,
  workStartHour: 8, workStartMinute: 0,
  workEndHour: 17, workEndMinute: 0,
  toleranceMinutes: 0,
  // Desplazamiento de la zona horaria del colegio en minutos respecto a UTC.
  // Perú = UTC-5 = -300. Todas las fechas/horas del sistema se interpretan en
  // esta zona, sin depender del reloj de la PC donde corre el backend.
  tzOffsetMinutes: -300,
  // Si la PRIMERA marcación del día es a partir de esta hora, el día se
  // considera inasistencia (no genera minutos de tardanza).
  absenceAfterHour: 9, absenceAfterMinute: 0,
  // Reglas especiales de SÁBADO (horario distinto).
  saturdayLateHour: 8, saturdayLateMinute: 30,
  saturdayAbsenceAfterHour: 9, saturdayAbsenceAfterMinute: 0,
  // Ventana (en minutos) para considerar dos huellas consecutivas del mismo
  // usuario el mismo día como UNA SOLA marcación (doble toque). 0 = desactivado.
  // Ej.: 1 => dos marcas a menos de 60s se agrupan (se conserva la primera).
  doubleTapToleranceMinutes: 1,
  autoSync: false,
  autoSyncInterval: 5,
  adminPassword: 'admin123'
};

function checkAdminPassword(req) {
  const settings = getSettings();
  const expected = settings.adminPassword || 'admin123';
  const provided = req.headers['x-admin-password'] || req.body?.adminPassword || req.query?.adminPassword;
  return provided && String(provided) === String(expected);
}

// Settings: Supabase (`app_settings`, fila id=1) es la fuente de verdad cuando
// la tabla existe; si no, se usa settings.json local. En Vercel el archivo vive
// en /tmp (efímero), por eso la persistencia real es la tabla.
let settingsCache = null;
let settingsDbChecked = false;

function readLocalSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function getSettings() {
  if (!settingsCache) settingsCache = readLocalSettings();
  return settingsCache;
}

async function ensureSettingsLoaded() {
  if (settingsDbChecked) return getSettings();
  settingsDbChecked = true;
  const local = getSettings();
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('data')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data && data.data && typeof data.data === 'object') {
      settingsCache = { ...local, ...data.data };
      setSchoolTzOffset(settingsCache.tzOffsetMinutes ?? -300);
      restartAutoSync(settingsCache);
    }
  } catch (err) {
    console.error('[Backend] No se pudo leer app_settings de Supabase:', err.message);
  }
  return getSettings();
}

async function saveSettings(s) {
  settingsCache = { ...DEFAULT_SETTINGS, ...s };
  setSchoolTzOffset(settingsCache.tzOffsetMinutes ?? -300);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsCache, null, 2));
  } catch (err) {
    console.error('[Backend] No se pudo guardar settings.json:', err.message);
  }
  settingsDbChecked = true;
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ id: 1, data: settingsCache, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.error('[Backend] No se pudo guardar app_settings en Supabase:', err.message);
  }
  return settingsCache;
}

function getIncidents() {
  try { return JSON.parse(fs.readFileSync(INCIDENTS_PATH, 'utf8')) || []; }
  catch { return []; }
}
function saveIncidents(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INCIDENTS_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error guardando incidencias:', err.message);
  }
}

function connectToDevice() {
  return new ZKDevice({
    host: process.env.DEVICE_IP || '192.168.0.201',
    port: parseInt(process.env.DEVICE_PORT) || 4370,
    password: parseInt(process.env.DEVICE_PASSWORD) || 0,
    timeoutMs: 10000
  });
}

// ── Helpers: la lógica de fechas/horas/tardanzas vive en lib/logic.js
//    (probada con `npm test`). Inicio del año escolar vigente: el historial
//    por usuario (detalle en Users) solo considera días desde esta fecha.
const HISTORY_START_DATE = '2026-08-01';

// Mantiene el desplazamiento de la zona horaria del colegio sincronizado con settings.json.
setSchoolTzOffset((getSettings().tzOffsetMinutes ?? -300));




// ──────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json({ success: true, data: getSettings() }));
app.post('/api/settings', async (req, res) => {
  const updated = { ...getSettings(), ...req.body };
  await saveSettings(updated);
  restartAutoSync(updated);
  res.json({ success: true, data: updated });
});

// ── Auto-sync ──
let syncTimer = null;

async function runSync() {
  try {
    const device = connectToDevice();
    await device.connect();
    const users = await device.users.list();
    const userRecords = users.map(u => ({
      id: parseInt(u.userId) || u.uid, name: u.name || `Usuario ${u.userId}`,
      card_number: u.card ? u.card.toString() : null
    }));
    const { error: ue } = await supabase.from('users').upsert(userRecords, { onConflict: 'id' });
    if (ue) throw ue;
    const logs = await device.attendance.list();
    await device.disconnect();
    const validUserIds = new Set(userRecords.map(u => u.id));
    const records = logs.map(log => ({
      user_id: parseInt(log.userId) || log.uid,
      check_time: deviceTsToInstant(log.timestamp).toISOString(),
      device_ip: process.env.DEVICE_IP || null
    })).filter(r => validUserIds.has(r.user_id));
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { error } = await supabase.from('attendance_logs').upsert(chunk, { onConflict: 'user_id, check_time', ignoreDuplicates: true });
      if (error) throw error;
    }
    console.log(`[AutoSync] ${records.length} registros sincronizados`);
  } catch (err) {
    console.error('[AutoSync] Error:', err.message);
  }
}

function restartAutoSync(settings) {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  // En serverless no hay proceso persistente ni acceso a la red del dispositivo.
  if (IS_SERVERLESS) return;
  if (settings.autoSync && settings.autoSyncInterval > 0) {
    syncTimer = setInterval(runSync, settings.autoSyncInterval * 60 * 1000);
    console.log(`[AutoSync] Activado cada ${settings.autoSyncInterval} min`);
    runSync();
  }
}
restartAutoSync(getSettings());

// Cargar y migrar los grados y horarios al arrancar
(async () => {
  await migrateLocalGradesToDb();
  await loadGradesFromDb();
  await loadSchedulesFromDb();
})();

// ──────────────────────────────────────────────
// SYNC
// ──────────────────────────────────────────────
app.post('/api/sync/users', async (req, res) => {
  const device = connectToDevice();
  try {
    await device.connect();
    const users = await device.users.list();
    await device.disconnect();
    const records = users.map(u => ({
      id: parseInt(u.userId) || u.uid,
      name: u.name || `Usuario ${u.userId}`,
      card_number: u.card ? u.card.toString() : null
    }));
    const { error } = await supabase.from('users').upsert(records, { onConflict: 'id' });
    if (error) throw error;
    userCache.invalidate(); // Clear cache after sync
    res.json({ success: true, count: records.length, data: records });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/sync/attendance', async (req, res) => {
  const device = connectToDevice();
  try {
    await device.connect();
    const users = await device.users.list();
    const userRecords = users.map(u => ({
      id: parseInt(u.userId) || u.uid, name: u.name || `Usuario ${u.userId}`,
      card_number: u.card ? u.card.toString() : null
    }));
    const { error: ue } = await supabase.from('users').upsert(userRecords, { onConflict: 'id' });
    if (ue) throw ue;

    const logs = await device.attendance.list();
    await device.disconnect();

    const validUserIds = new Set(userRecords.map(u => u.id));
    const records = logs.map(log => ({
      user_id: parseInt(log.userId) || log.uid,
      check_time: deviceTsToInstant(log.timestamp).toISOString(),
      device_ip: process.env.DEVICE_IP || null
    })).filter(r => validUserIds.has(r.user_id));

    // Batch insert in chunks to avoid timeouts
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { error } = await supabase.from('attendance_logs').upsert(chunk, { onConflict: 'user_id, check_time', ignoreDuplicates: true });
      if (error) throw error;
    }
    userCache.invalidate(); // Clear cache after sync
    res.json({ success: true, count: records.length });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

function matchesGrade(userGrade, targetGrade) {
  if (!targetGrade || targetGrade === 'all' || targetGrade === 'todos' || targetGrade === '') return true;
  const targets = String(targetGrade).split(',').map(s => s.trim()).filter(Boolean);
  if (targets.length === 0) return true;
  // Coincide si CUALQUIERA de los grados seleccionados matchea (OR)
  return targets.some(t => matchesSingleGrade(userGrade, t));
}

function matchesSingleGrade(userGrade, targetGrade) {
  if (!targetGrade || targetGrade === 'all' || targetGrade === 'todos') return true;
  const ug = (userGrade || 'General').toLowerCase();
  const tg = targetGrade.toLowerCase();
  if (tg === 'secundaria_alta' || tg === 'secundaria alta' || tg === '3_4_5_secundaria') {
    return ug.includes('3°') || ug.includes('4°') || ug.includes('5°') || ug.includes('3ro') || ug.includes('4to') || ug.includes('5to');
  }
  if (tg === 'secundaria') {
    return ug.includes('secundaria');
  }
  if (tg === 'primaria') {
    return ug.includes('primaria');
  }
  if (tg === 'inicial') {
    return ug.includes('inicial');
  }
  if (tg === 'docentes' || tg === 'personal') {
    return ug.includes('docente') || ug.includes('personal');
  }
  return ug === tg;
}

// Parsea el parámetro `grade`/`grades` aceptando:
//  - un solo valor ("General")
//  - lista separada por comas ("General,Docentes / Personal")
//  - array por query repetida (?grade=A&grade=B)
// Devuelve null = sin filtro, o array de strings.
function parseGradesParam(req) {
  let raw = req.query.grades;
  if (raw === undefined) raw = req.query.grade;
  if (raw === undefined || raw === null) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  const cleaned = arr.map(s => String(s).trim()).filter(s => s && s.toLowerCase() !== 'all' && s.toLowerCase() !== 'todos');
  // Si viene vacío o solo 'all', no filtrar. Si viene '' explícito tampoco.
  if (arr.length === 1 && (arr[0] === '' || String(arr[0]).toLowerCase() === 'all')) return null;
  if (cleaned.length === 0) return null;
  // Expandir alias como secundaria_alta a sus grados reales ya lo hace matchesGrade,
  // aquí solo devolvemos la lista para filtrar y para eco en la respuesta.
  return [...new Set(cleaned)];
}

function filterLogsByGrades(logs, gradeMap, gradesList) {
  if (!gradesList || gradesList.length === 0) return logs || [];
  const joined = gradesList.join(',');
  return (logs || []).filter(log => {
    const uGrade = gradeMap[log.user_id] || 'General';
    return matchesGrade(uGrade, joined);
  });
}

// ──────────────────────────────────────────────
// DATA: attendance
// ──────────────────────────────────────────────
app.get('/api/data/attendance', async (req, res) => {
  try {
    const filter = req.query.filter || 'today';
    const gradesList = parseGradesParam(req); // multi-selección: ?grade=A,B o ?grades=A&grades=B
    const settings = getSettings();
    await userCache.get();
    const userMap = userCache.getMap();
    const gradeMap = await userCache.getGradeMap();
    const schedules = await getUserSchedulesSafe();

    let query = supabase.from('attendance_logs').select('id, user_id, check_time').order('check_time', { ascending: false });

    if (filter === 'today') {
      const todayStart = dateStrToSchoolInstant(getDayKey(new Date()), 0, 0);
      query = query.gte('check_time', todayStart.toISOString());
    } else if (filter === 'week') {
      const weekStart = dateStrToSchoolInstant(getDayKey(new Date(Date.now() - 7 * 86400000)), 0, 0);
      query = query.gte('check_time', weekStart.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter by grade(s) if specified (acepta selección múltiple)
    let filteredLogs = filterLogsByGrades(data, gradeMap, gradesList);

    // Agrupar logs por usuario para determinar correctamente el punch type
    const logsByUser = {};
    filteredLogs.forEach(log => {
      const userId = log.user_id;
      if (!logsByUser[userId]) logsByUser[userId] = [];
      logsByUser[userId].push(log);
    });

    const enriched = filteredLogs.map(log => {
      const logDate = new Date(log.check_time);
      const dayKey = getDayKey(logDate);

      // Encontrar todos los logs del mismo usuario para el mismo día
      const userDayLogs = (logsByUser[log.user_id] || [])
        .filter(l => getDayKey(new Date(l.check_time)) === dayKey)
        .sort((a, b) => new Date(a.check_time) - new Date(b.check_time));

      // Determinar el índice de este log en la secuencia del día
      const logIndex = userDayLogs.findIndex(l => l.id === log.id);

      // Agrupar dobles marcaciones: la etiqueta se asigna sobre la secuencia
      // "efectiva" (grupos), para que una huella doble no corra las posiciones
      // (una 2ª huella de entrada ya no se clasifica como regreso de refrigerio).
      const groups = groupDoubleTaps(userDayLogs, settings);
      const collapsed = groups.map(g => g[0]);
      let groupIdx = 0;
      let isDuplicate = false;
      for (let gi = 0; gi < groups.length; gi++) {
        const pos = groups[gi].findIndex(l => l.id === log.id);
        if (pos >= 0) { groupIdx = gi; isDuplicate = pos > 0; break; }
      }

      // Etiqueta detallada de la marca (1..4 según el orden efectivo del día)
      const punchLabel = getPunchLabel(collapsed, groupIdx);
      // Compatibilidad: mantener punch_type con el esquema antiguo (entry/exit)
      const punchType = (punchLabel === 'lunch_out' || punchLabel === 'exit') ? 'exit' : 'entry';

      // El estado del día y los minutos tarde se definen SOLO con la PRIMERA
      // marca del día (ingreso, saltando marcas de madrugada sospechosas).
      // Las demás marcas heredan el estado y suman 0.
      const firstPunchDate = firstEffectivePunch(collapsed.length > 0 ? collapsed : userDayLogs).first;
      const firstPunchTime = firstPunchDate ? new Date(firstPunchDate.check_time) : logDate;
      const sched = schedules[log.user_id] || null;
      const dayStatus = sched ? getUserDayStatus(firstPunchTime, sched, settings) : getDayStatus(firstPunchTime, settings);

      return {
        ...log,
        user_name: userMap[log.user_id] || `Usuario ${log.user_id}`,
        grade: gradeMap[log.user_id] || 'General',
        punch_type: punchType,
        punch_label: punchLabel,
        status: dayStatus,
        lateMinutes: logIndex === 0 ? (sched ? getUserLateMinutes(firstPunchTime, sched, settings) : getLateMinutes(firstPunchTime, settings)) : 0,
        isDuplicate
      };
    });

    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: report
// ──────────────────────────────────────────────
// Lee TODAS las filas de una consulta a Supabase paginando de a 1000 (Supabase
// limita cada respuesta a 1000 filas por defecto). Sin esto, los reportes con
// muchos usuarios o rangos amplios se truncaban silenciosamente y los días más
// recientes aparecían como "sin marca" (falsas inasistencias).
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  const all = [];
  let offset = 0;
  while (true) {
    const q = buildQuery().range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

app.get('/api/data/report', async (req, res) => {
  try {
    const { from, to, userId } = req.query;
    const gradesList = parseGradesParam(req); // multi-selección
    if (!from || !to) return res.status(400).json({ success: false, message: 'from y to son requeridos (YYYY-MM-DD)' });

    const settings = getSettings();
    const fromDate = dateStrToSchoolInstant(from, 0, 0);
    const toDate = dateStrToSchoolInstant(to, 23, 59, 59);

    // Use cached users and grade map
    await userCache.get();
    const userMap = userCache.getMap();
    const gradeMap = await userCache.getGradeMap();
    const schedules = await getUserSchedulesSafe();
    const excusesByUser = excuseIndex(await getExcusesSafe());

    // Fetch logs (only needed fields) — paginado para no truncar en >1000 filas
    const logs = await fetchAllRows(() => {
      let q = supabase.from('attendance_logs').select('user_id, check_time')
        .gte('check_time', fromDate.toISOString())
        .lte('check_time', toDate.toISOString())
        .order('check_time', { ascending: true });
      if (userId) q = q.eq('user_id', parseInt(userId));
      return q;
    });
    if (!logs) return res.json({ success: true, data: [] });

    // Build set of all dates in the requested range (YYYY-MM-DD, zona del colegio)
    const allDates = listSchoolDates(from, to);

    // Determine which users are in scope (by grade filter / specific user)
    // gradesList = null => sin filtro. Array => OR entre los seleccionados.
    const gradeJoined = gradesList ? gradesList.join(',') : null;
    const inScopeUserIds = new Set();
    Object.keys(userMap).forEach(uid => {
      const id = parseInt(uid);
      if (userId && id !== parseInt(userId)) return;
      const userGrade = gradeMap[id] || 'General';
      if (gradeJoined && !matchesGrade(userGrade, gradeJoined)) return;
      inScopeUserIds.add(id);
    });

    // Group logs by user_id, then by day
    const byUser = {};
    (logs || []).forEach(log => {
      const uid = log.user_id;
      if (!inScopeUserIds.has(uid)) return;
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(log);
    });

    // Build report: include ALL in-scope users (even if zero logs)
    const report = Array.from(inScopeUserIds).map(uid => {
      const userLogs = byUser[uid] || [];
      const sched = schedules[uid] || null;
      const byDay = {};
      userLogs.forEach(log => {
        const d = new Date(log.check_time);
        const key = getDayKey(d);
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push({ ...log, date: d });
      });

      const days = [];
      const lateAbsentDates = [];
      Object.entries(byDay).forEach(([date, entries]) => {
        entries.sort((a, b) => a.date - b.date);
        // Agrupar dobles marcaciones (la clasificación/horas usan la secuencia efectiva)
        const groups = groupDoubleTaps(entries, settings);
        const collapsed = groups.map(g => g[0]);
        const rawTotal = entries.length;
        const groupedCount = rawTotal - collapsed.length;
        const { first, stray } = firstEffectivePunch(collapsed);
        const last = collapsed[collapsed.length - 1];
        const status = sched ? getUserDayStatus(first.date, sched, settings) : getDayStatus(first.date, settings);
        // Regla de inasistencia: si la PRIMERA marca es a las 9:00 (o la hora
        // configurada en absenceAfterHour) o después, el día es falta, aunque
        // haya marcado. No cuenta como día presente ni suma minutos tarde.
        // Solo vale para días en que el usuario debía asistir según su horario.
        if (status === 'absent') {
          const dow = toSchoolDate(first.date).getUTCDay();
          if (isExpectedWorkDaySync(sched, dow, date)) lateAbsentDates.push(date);
          return;
        }
        // Horas trabajadas: con 4+ marcas se descuenta el refrigerio; si el
        // intervalo supera el tope el dato es anómalo y se reporta null.
        let workHours = null;
        if (collapsed.length > 1) {
          const seg = collapsed.length >= 4
            ? (collapsed[1].date - collapsed[0].date) + (collapsed[3].date - collapsed[2].date)
            : (last.date - first.date);
          const raw = seg / (1000 * 60 * 60);
          if (raw > 0 && raw <= MAX_WORK_HOURS) workHours = raw.toFixed(1);
        }
        // Día "a revisar": doble marcación absorbida, marca de madrugada sospechosa
        // (posible zona horaria errada) o más de 4 marcas efectivas.
        const needsReview = groupedCount > 0 || collapsed.length > 4 || stray;
        const reviewReason = stray
          ? 'Marca sospechosa'
          : groupedCount > 0
            ? 'Doble marcación'
            : collapsed.length > 4 ? 'Más de 4 marcas' : null;
        days.push({
          date,
          checkIn: first.date.toISOString(),
          checkOut: collapsed.length > 1 ? last.date.toISOString() : null,
          totalChecks: rawTotal,
          marks: collapsed.map(m => m.date.toISOString()),
          status,
          // Minutos tarde: SOLO lo que se demoró al ingresar (primera marca),
          // nunca salidas ni refrigerios, y 0 si es inasistencia.
          lateMinutes: sched ? getUserLateMinutes(first.date, sched, settings) : getLateMinutes(first.date, settings),
          hoursWorked: workHours,
          needsReview,
          reviewReason
        });
      });

      // Ausencias = días laborables SEGÚN EL HORARIO del usuario sin marcación
      //             + días con primera marca después del umbral de inasistencia.
      const presentDates = new Set(days.map(d => d.date));
      const absentDays = allDates.filter(dateStr => {
        if (presentDates.has(dateStr)) return false;
        const dow = toSchoolDate(dateStrToSchoolInstant(dateStr, 12, 0, 0)).getUTCDay();
        return isExpectedWorkDaySync(sched, dow, dateStr);
      });
      lateAbsentDates.forEach(d => { if (!absentDays.includes(d)) absentDays.push(d); });
      days.sort((a, b) => a.date.localeCompare(b.date));
      absentDays.sort();

      // Justificaciones de esta persona dentro del período (una por día) +
      // resumen de planilla: días laborados vs. esperados, horas realmente
      // laboradas, horas extra, cumplimiento de turno y la separación entre
      // inasistencias/tardanzas justificadas e injustificadas.
      const userExcuses = Object.values(excusesByUser[uid] || {}).filter(e => e.day >= from && e.day <= to);
      const expectedDays = allDates.filter(dateStr => {
        const dow = toSchoolDate(dateStrToSchoolInstant(dateStr, 12, 0, 0)).getUTCDay();
        return isExpectedWorkDaySync(sched, dow, dateStr);
      }).length;
      const payroll = buildPayrollSummary({ days, absentDays, excuses: userExcuses, expectedDays, schedule: sched, settings });

      // Acumulado de tardanza del período (suma de minutos tarde por día).
      // NOTA: solo suma días CON marcación (days). Las inasistencias
      // (absentDays) NO aportan minutos: van en su propio campo.
      const totalLateMinutes = days.reduce((acc, d) => acc + (d.lateMinutes || 0), 0);
      const lateDays = days.filter(d => d.status === 'late').length;
      const absentCount = absentDays.length;
      const reviewDays = days.filter(d => d.needsReview).length;

      return {
        user_id: uid,
        name: userMap[uid] || `#${uid}`,
        grade: gradeMap[uid] || 'General',
        area: payroll.area || null,
        shift: payroll.shift,
        schedule: scheduleToApi(sched),
        days: payroll.days,
        absentDays,
        absentCount,
        justifiedAbsences: payroll.absentJustifiedDays,
        unjustifiedAbsences: payroll.absentUnjustifiedDays,
        justifiedAbsenceCount: payroll.absentJustifiedCount,
        unjustifiedAbsenceCount: payroll.absentUnjustifiedCount,
        excuses: userExcuses.map(excuseToApi),
        expectedDays: payroll.expectedDays,
        expectedMinutes: payroll.expectedMinutes,
        workedDays: payroll.workedDays,
        workedMinutes: payroll.workedMinutes,
        workedTime: payroll.workedTime,
        workedHours: payroll.workedHours,
        extraMinutes: payroll.extraMinutes,
        extraTime: payroll.extraTime,
        compliancePct: payroll.compliancePct,
        totalLateMinutes,
        lateMinutesFormatted: formatLateMinutes(totalLateMinutes),
        lateMinutesCharged: payroll.lateMinutesCharged,
        lateMinutesExcused: payroll.lateMinutesExcused,
        excusedLateDays: payroll.excusedLateDays,
        lateDays,
        reviewDays
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    // Totales del reporte completo (para el encabezado/resumen imprimible).
    // totalLateMinutes: solo días con marcación. Las inasistencias van aparte.
    const totals = {
      users: report.length,
      totalLateMinutes: report.reduce((acc, u) => acc + (u.totalLateMinutes || 0), 0),
      lateMinutesCharged: report.reduce((acc, u) => acc + (u.lateMinutesCharged || 0), 0),
      lateMinutesExcused: report.reduce((acc, u) => acc + (u.lateMinutesExcused || 0), 0),
      lateDays: report.reduce((acc, u) => acc + (u.lateDays || 0), 0),
      totalAbsences: report.reduce((acc, u) => acc + (u.absentCount ?? (u.absentDays || []).length), 0),
      justifiedAbsences: report.reduce((acc, u) => acc + (u.justifiedAbsenceCount || 0), 0),
      unjustifiedAbsences: report.reduce((acc, u) => acc + (u.unjustifiedAbsenceCount || 0), 0),
      toReview: report.reduce((acc, u) => acc + (u.reviewDays || 0), 0),
      expectedDays: report.reduce((acc, u) => acc + (u.expectedDays || 0), 0),
      workedDays: report.reduce((acc, u) => acc + (u.workedDays || 0), 0),
      workedMinutes: report.reduce((acc, u) => acc + (u.workedMinutes || 0), 0),
      extraMinutes: report.reduce((acc, u) => acc + (u.extraMinutes || 0), 0)
    };
    totals.lateMinutesFormatted = formatLateMinutes(totals.totalLateMinutes);
    totals.workedTime = formatLateMinutes(totals.workedMinutes);
    totals.extraTime = formatLateMinutes(totals.extraMinutes);
    totals.expectedMinutes = report.reduce((acc, u) => acc + (u.expectedMinutes || 0), 0);
    totals.compliancePct = totals.expectedMinutes > 0
      ? Math.min(100, Math.round((totals.workedMinutes / totals.expectedMinutes) * 100))
      : null;

    res.json({
      success: true,
      data: report,
      totals,
      excuseTypes: EXCUSE_TYPES.map(t => ({ value: t, label: EXCUSE_LABELS[t] })),
      grades: gradesList || [],
      lateLimit: settings ? `${String(settings.lateHour).padStart(2, '0')}:${String(settings.lateMinute).padStart(2, '0')}` : null,
      saturdayLateLimit: settings ? `${String(settings.saturdayLateHour ?? 8).padStart(2, '0')}:${String(settings.saturdayLateMinute ?? 0).padStart(2, '0')}` : null,
      absentAfter: settings ? `${String(settings.absenceAfterHour ?? 9).padStart(2, '0')}:${String(settings.absenceAfterMinute ?? 0).padStart(2, '0')}` : null,
      saturdayAbsentAfter: settings ? `${String(settings.saturdayAbsenceAfterHour ?? 9).padStart(2, '0')}:${String(settings.saturdayAbsenceAfterMinute ?? 0).padStart(2, '0')}` : null,
      toleranceMinutes: settings ? (settings.toleranceMinutes || 0) : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: grades list and stats
// ──────────────────────────────────────────────
app.get('/api/data/grades', async (req, res) => {
  try {
    const users = await userCache.get();
    const gradeMap = await userCache.getGradeMap();
    const counts = {};

    DEFAULT_GRADES.forEach(g => { counts[g] = 0; });
    users.forEach(u => {
      const g = gradeMap[u.id] || 'General';
      counts[g] = (counts[g] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        grades: DEFAULT_GRADES,
        counts,
        totalUsers: users.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: update user grade
// ──────────────────────────────────────────────
app.post('/api/data/users/:id/grade', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { grade } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId inválido' });

    await setUserGrade(userId, grade || 'General');
    userCache.invalidate();
    res.json({ success: true, message: `Grado asignado: ${grade || 'General'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: batch update user grades
// ──────────────────────────────────────────────
app.post('/api/data/users/batch-grade', (req, res) => {
  const { userIds, grade } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: 'userIds array requerido' });
  }

  const groups = getUserGroups();
  userIds.forEach(id => {
    groups[parseInt(id)] = grade || 'General';
  });
  saveUserGroups(groups);
  userCache.invalidate();

  res.json({ success: true, count: userIds.length, message: `${userIds.length} usuarios asignados a ${grade}` });
});

// ──────────────────────────────────────────────
// DATA: users
// ──────────────────────────────────────────────
app.get('/api/data/users', async (req, res) => {
  try {
    const data = await userCache.get();
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: user detail
// ──────────────────────────────────────────────
app.get('/api/data/users/:id/detail', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const settings = getSettings();
    const gradeMap = await userCache.getGradeMap();

    const { data: user } = await supabase.from('users').select('id, name').eq('id', userId).single();
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    const userWithGrade = {
      ...user,
      grade: gradeMap[userId] || 'General'
    };

    // Corte del historial: solo desde el inicio del año escolar vigente. Los
    // meses/años anteriores ya no se consideran en el detalle por usuario.
    const historyFrom = dateStrToSchoolInstant(HISTORY_START_DATE, 0, 0);

    const { data: logs } = await supabase.from('attendance_logs').select('user_id, check_time')
      .eq('user_id', userId)
      .gte('check_time', historyFrom.toISOString())
      .order('check_time', { ascending: true });
    const sched = await getUserSchedule(userId);
    const days = buildDaySummaries(logs, settings, sched);

    // Días laborables SEGÚN EL HORARIO del usuario SIN ninguna marcación = inasistencias.
    // El rango va desde el corte del año escolar hasta hoy, en zona del colegio.
    const presentKeySet = new Set(days.map(d => d.date));
    const todayKey = getDayKey(new Date());
    const startKey = HISTORY_START_DATE;
    const absentDays = listSchoolDates(startKey, todayKey).filter(k => {
      if (presentKeySet.has(k)) return false;
      const dow = toSchoolDate(dateStrToSchoolInstant(k, 12, 0, 0)).getUTCDay();
      return isExpectedWorkDaySync(sched, dow, k);
    });

    const markedAbsent = days.filter(d => d.status === 'absent').length;
    const absent = markedAbsent + absentDays.length;
    const onTime = days.filter(d => d.status === 'on-time').length;
    const late = days.filter(d => d.status === 'late').length;
    const present = Math.max(0, days.length - markedAbsent);
    const withCheckout = days.filter(d => d.checkOut !== null).length;
    const totalLateMinutes = days.reduce((acc, d) => acc + (d.lateMinutes || 0), 0);

    res.json({
      success: true,
      data: {
        user: userWithGrade,
        schedule: scheduleToApi(sched),
        stats: {
          total: present,
          onTime,
          late,
          absent,
          withCheckout,
          totalLateMinutes,
          lateMinutesFormatted: formatLateMinutes(totalLateMinutes),
          attendanceRate: present > 0 ? Math.round((onTime / present) * 100) : 0
        },
        days,
        absentDays
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: dashboard
// ──────────────────────────────────────────────
app.get('/api/data/dashboard', async (req, res) => {
  try {
    const settings = getSettings();
    const gradesList = parseGradesParam(req); // multi-selección
    const gradeJoined = gradesList ? gradesList.join(',') : null;
    const gradeMap = await userCache.getGradeMap();
    const schedules = await getUserSchedulesSafe();
    const todayStart = dateStrToSchoolInstant(getDayKey(new Date()), 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);

    // Today's logs
    const { data: rawTodayLogs } = await supabase
      .from('attendance_logs')
      .select('*')
      .gte('check_time', todayStart.toISOString())
      .lt('check_time', tomorrowStart.toISOString());

    // Filter today's logs by grade(s) if requested
    let todayLogs = rawTodayLogs || [];
    if (gradeJoined) {
      todayLogs = todayLogs.filter(log => matchesGrade(gradeMap[log.user_id], gradeJoined));
    }

    // Total users (filtered or total)
    const allUsers = await userCache.get();
    const relevantUsers = gradeJoined
      ? allUsers.filter(u => matchesGrade(u.grade, gradeJoined))
      : allUsers;
    const totalUsers = relevantUsers.length;

    // Usuarios que DEBÍAN asistir hoy según su horario personal (los que no
    // tenían turno hoy no cuentan como ausentes). Sin horario => regla general.
    const todayDOW = toSchoolDate(todayStart).getUTCDay();
    const todayKey = getDayKey(todayStart);
    const expectedToday = relevantUsers.filter(u => {
      const s = schedules[u.id] || null;
      return isExpectedWorkDaySync(s, todayDOW, todayKey);
    }).length;

    // Build today's day summaries per user
    const userDayMap = {};
    todayLogs.forEach(log => {
      const uid = log.user_id;
      if (!userDayMap[uid]) userDayMap[uid] = [];
      userDayMap[uid].push(log);
    });

    let onTime = 0, late = 0, checkedIn = 0, withCheckout = 0;
    Object.values(userDayMap).forEach(entries => {
      entries.sort((a, b) => new Date(a.check_time) - new Date(b.check_time));
      const collapsed = groupDoubleTaps(entries, settings).map(g => g[0]);
      const first = new Date(firstEffectivePunch(collapsed).first.check_time);
      const last = new Date(collapsed[collapsed.length - 1].check_time);
      const sched = schedules[entries[0].user_id] || null;
      const dayStatus = sched ? getUserDayStatus(first, sched, settings) : getDayStatus(first, settings);
      // Si la primera marca es desde las 9:00 (o la hora configurada) ya es
      // inasistencia: no cuenta como "checkeado presente" ni suma tardanzas.
      if (dayStatus === 'absent') return;
      checkedIn++;
      if (dayStatus === 'on-time') onTime++;
      else late++;
      if (getPunchType(last) === 'exit') withCheckout++;
    });

    const absent = Math.max(0, (expectedToday || 0) - checkedIn);

    // Weekly trend (unique users per day)
    const weekAgoStart = dateStrToSchoolInstant(getDayKey(new Date(Date.now() - 7 * 86400000)), 0, 0);
    const weekLogs = await fetchAllRows(() =>
      supabase.from('attendance_logs')
        .select('check_time, user_id')
        .gte('check_time', weekAgoStart.toISOString())
        .order('check_time', { ascending: true })
    );

    if (gradeJoined) {
      weekLogs = weekLogs.filter(log => matchesGrade(gradeMap[log.user_id], gradeJoined));
    }

    const trend = {};
    weekLogs.forEach(log => {
      const d = getDayKey(new Date(log.check_time));
      if (!trend[d]) trend[d] = new Set();
      trend[d].add(log.user_id);
    });

    const weeklyTrend = Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => {
        const dayName = toSchoolDate(dateStrToSchoolInstant(date, 12, 0, 0))
          .toLocaleDateString('es', { weekday: 'long', timeZone: 'UTC' });
        return { date, dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1), count: users.size };
      });

    // Late list (who arrived late today)
    const lateList = Object.entries(userDayMap)
      .map(([uid, entries]) => {
        entries.sort((a, b) => new Date(a.check_time) - new Date(b.check_time));
        const collapsed = groupDoubleTaps(entries, settings).map(g => g[0]);
        const first = new Date(firstEffectivePunch(collapsed).first.check_time);
        const sched = schedules[parseInt(uid)] || null;
        const status = sched ? getUserDayStatus(first, sched, settings) : getDayStatus(first, settings);
        return { user_id: parseInt(uid), time: first.toISOString(), status };
      })
      .filter(e => e.status === 'late')
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    // Early departures (left before their work end)
    const earlyList = Object.entries(userDayMap)
      .map(([uid, entries]) => {
        entries.sort((a, b) => new Date(a.check_time) - new Date(b.check_time));
        const collapsed = groupDoubleTaps(entries, settings).map(g => g[0]);
        const last = new Date(collapsed[collapsed.length - 1].check_time);
        const lastType = getPunchType(last);
        if (lastType !== 'exit') return null;
        const sched = schedules[parseInt(uid)] || null;
        const endTotal = getUserEndTotal(sched, settings);
        const leaveTotal = getSchoolTotal(last);
        if (leaveTotal < endTotal) return { user_id: parseInt(uid), time: last.toISOString() };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json({
      success: true,
      data: {
        today: { total: todayLogs?.length || 0, onTime, late, absent, checkedIn, withCheckout },
        totalUsers: totalUsers || 0,
        expectedToday,
        weeklyTrend,
        lateList,
        earlyList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DEVICE: create user
// ──────────────────────────────────────────────
app.post('/api/device/users', async (req, res) => {
  const { userId, name, grade } = req.body;
  if (!userId || !name) return res.status(400).json({ success: false, message: 'userId y name son requeridos' });

  const device = connectToDevice();
  try {
    await device.connect();
    const existing = await device.users.list();
    const match = existing.find(u => u.userId === String(userId));

    if (!match) {
      // Find a free uid slot (internal device slot, not the userId/PIN)
      const usedUids = new Set(existing.map(u => u.uid));
      let uid = 1;
      while (usedUids.has(uid)) uid++;
      if (uid > 65535) throw new Error('No hay slots libres en el dispositivo');

      await device.users.set({ uid, userId: String(userId), name, privilege: 0, password: '', groupId: '1', card: 0 });
    }
    await device.disconnect();

    // Always upsert to Supabase (new user or existing on device but missing in DB)
    const { error: ue } = await supabase.from('users').upsert(
      { id: parseInt(userId), name, card_number: null },
      { onConflict: 'id' }
    );
    if (ue) throw ue;

    // Save grade to user_groups
    await setUserGrade(parseInt(userId), grade || 'General');
    userCache.invalidate();

    res.json({ success: true, message: match ? `Usuario ${name} sincronizado con Supabase` : `Usuario ${name} creado en el dispositivo` });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DEVICE: update user
// ──────────────────────────────────────────────
app.put('/api/device/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { name, grade } = req.body;
  if (!userId || !name) return res.status(400).json({ success: false, message: 'userId y name son requeridos' });

  const device = connectToDevice();
  try {
    await device.connect();
    const existing = await device.users.list();
    const match = existing.find(u => u.userId === String(userId));
    if (match) {
      await device.users.set({
        ...match,
        name
      });
    }
    await device.disconnect();

    const { error: ue } = await supabase.from('users').update({ name }).eq('id', userId);
    if (ue) throw ue;

    if (grade !== undefined) {
      await setUserGrade(userId, grade || 'General');
    }
    userCache.invalidate();

    res.json({ success: true, message: `Usuario ${name} actualizado correctamente` });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DEVICE: enroll fingerprint
// ──────────────────────────────────────────────
const { EVENT } = require('zklib-ng');

app.post('/api/device/enroll', async (req, res) => {
  const { userId, fingerId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId es requerido' });

  req.socket.setTimeout(120000);

  const device = connectToDevice();
  try {
    await device.connect();

    // El MB1 ZMM510-N requiere registro explícito de eventos
    // antes de que el dispositivo envíe las notificaciones de presión de huella
    const flags = EVENT.EF_ENROLLUSER | EVENT.EF_ENROLLFINGER | EVENT.EF_FINGER;
    await device.enroll.regEvent(flags);
    console.log('Evento de enrollment registrado, iniciando captura...');

    let pressCount = 0;
    const done = await device.enroll.fingerprint({
      userId: String(userId),
      fingerId: fingerId || 0,
      onProgress: ({ index, score }) => {
        pressCount = index;
        console.log(`Enroll: presión ${index}/3, calidad: ${score}`);
      }
    });

    await device.disconnect();

    res.json({
      success: true,
      message: done
        ? `Huella registrada exitosamente (${pressCount} presiones)`
        : 'Enrollment completado pero el dispositivo reportó un error'
    });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    console.error('Enroll error:', err.message);
    const msg = err.message.includes('timeout')
      ? 'Timeout: colocá el dedo en el sensor cuando el dispositivo lo indique. Si el dispositivo no muestra la pantalla de enrollment, registrá la huella directamente desde el menú del dispositivo.'
      : err.message;
    res.status(500).json({ success: false, message: msg });
  }
});

// ──────────────────────────────────────────────
// DEVICE: clear admins (unlock menu)
// ──────────────────────────────────────────────
app.post('/api/device/clear-admin', async (req, res) => {
  const device = connectToDevice();
  try {
    await device.connect();
    await device.control.clearAdmins();
    await device.control.refreshData();
    await device.disconnect();
    res.json({ success: true, message: 'Bloqueos de administrador eliminados del dispositivo. Ahora puedes ingresar al menú.' });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DEVICE: delete user
// ──────────────────────────────────────────────
app.delete('/api/device/users/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) return res.status(400).json({ success: false, message: 'ID de usuario inválido' });

  const device = connectToDevice();
  try {
    await device.connect();
    const existing = await device.users.list();
    const match = existing.find(u => u.userId === String(userId));
    if (match) {
      await device.users.delete(match.uid);
    }
    await device.disconnect();

    // Also delete from Supabase
    await supabase.from('users').delete().eq('id', userId);
    await supabase.from('attendance_logs').delete().eq('user_id', userId);

    // Limpiar horario personal del usuario
    try {
      const schedules = await getUserSchedulesSafe();
      if (schedules[userId]) {
        delete schedules[userId];
        scheduleCache = schedules;
        saveLocalUserSchedules(schedules);
      }
      await supabase.from('user_schedules').delete().eq('user_id', userId);
    } catch (err) {
      console.error('[Backend] No se pudo limpiar el horario del usuario:', err.message);
    }

    res.json({ success: true, message: match ? `Usuario ${userId} eliminado del dispositivo y la base de datos` : 'Usuario eliminado de la base de datos' });
  } catch (err) {
    if (device.session) try { await device.disconnect(); } catch { }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// ADMIN: verificar contraseña de administrador
// ──────────────────────────────────────────────
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body || {};
  const settings = getSettings();
  const expected = settings.adminPassword || 'admin123';
  if (password && String(password) === String(expected)) {
    return res.json({ success: true, message: 'Acceso de administrador concedido' });
  }
  return res.status(401).json({ success: false, message: 'Contraseña de administrador incorrecta' });
});

// ──────────────────────────────────────────────
// DATA: marcaciones de un usuario en un día (para editor admin)
// GET /api/data/attendance/day?userId=N&date=YYYY-MM-DD
// ──────────────────────────────────────────────
app.get('/api/data/attendance/day', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const dateStr = req.query.date;
    if (!userId) return res.status(400).json({ success: false, message: 'userId es requerido' });
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ success: false, message: 'date es requerido (YYYY-MM-DD)' });
    }
    const settings = getSettings();
    const from = dateStrToSchoolInstant(dateStr, 0, 0);
    const to = dateStrToSchoolInstant(dateStr, 23, 59, 59);
    if (isNaN(from.getTime())) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const { data: logs, error } = await supabase.from('attendance_logs')
      .select('id, user_id, check_time')
      .eq('user_id', userId)
      .gte('check_time', from.toISOString())
      .lte('check_time', to.toISOString())
      .order('check_time', { ascending: true });
    if (error) throw error;

    await userCache.get();
    const userMap = userCache.getMap();
    const gradeMap = await userCache.getGradeMap();
    const sched = await getUserSchedule(userId);
    const sorted = (logs || []).slice().sort((a, b) => new Date(a.check_time) - new Date(b.check_time));
    // Agrupar dobles marcaciones: la etiqueta se asigna según el orden efectivo
    // y las huellas repetidas se marcan como duplicadas para que el admin las vea.
    const groups = groupDoubleTaps(sorted, settings);
    const collapsed = groups.map(g => g[0]);
    // Estado/minutos definidos SOLO por la primera marca del día (ingreso),
    // saltando marcas de madrugada sospechosas (otra caja/zona horaria errada).
    const firstPunchDate = (collapsed.length > 0 ? firstEffectivePunch(collapsed).first : null);
    const firstPunchTime = firstPunchDate ? new Date(firstPunchDate.check_time) : null;
    const dayStatus = firstPunchTime
      ? (sched ? getUserDayStatus(firstPunchTime, sched, settings) : getDayStatus(firstPunchTime, settings))
      : null;
    const enriched = sorted.map((log, idx) => {
      let groupIdx = 0;
      let isDuplicate = false;
      for (let gi = 0; gi < groups.length; gi++) {
        const pos = groups[gi].findIndex(l => l.id === log.id);
        if (pos >= 0) { groupIdx = gi; isDuplicate = pos > 0; break; }
      }
      return {
        ...log,
        punch_label: getPunchLabel(collapsed, groupIdx),
        status: dayStatus,
        lateMinutes: idx === 0 && firstPunchTime ? (sched ? getUserLateMinutes(firstPunchTime, sched, settings) : getLateMinutes(firstPunchTime, settings)) : 0,
        isDuplicate
      };
    });

    res.json({
      success: true,
      data: {
        user_id: userId,
        name: userMap[userId] || `#${userId}`,
        grade: gradeMap[userId] || 'General',
        date: dateStr,
        logs: enriched
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: crear una marcación manual (requiere admin)
// POST /api/data/attendance  body: { userId, check_time, adminPassword }
// ──────────────────────────────────────────────
app.post('/api/data/attendance', async (req, res) => {
  try {
    if (!checkAdminPassword(req)) {
      return res.status(401).json({ success: false, message: 'Se requiere contraseña de administrador' });
    }
    const userId = parseInt(req.body?.userId);
    const { check_time } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'userId es requerido' });
    if (!check_time) return res.status(400).json({ success: false, message: 'check_time es requerido (YYYY-MM-DDTHH:mm)' });
    // La entrada es hora LOCAL del colegio (lo que ve el admin), NO hora de la
    // PC servidor: la convertimos a instante UTC con la zona del colegio.
    const m = String(check_time).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return res.status(400).json({ success: false, message: 'check_time debe ser YYYY-MM-DDTHH:mm' });
    const dt = dateStrToSchoolInstant(`${m[1]}-${m[2]}-${m[3]}`, parseInt(m[4], 10), parseInt(m[5], 10));

    const { data: user } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
    if (!user) return res.status(404).json({ success: false, message: `No existe el usuario ${userId}` });

    const { data, error } = await supabase
      .from('attendance_logs')
      .insert({ user_id: userId, check_time: dt.toISOString() })
      .select('id, user_id, check_time');
    if (error) throw error;
    res.json({ success: true, message: 'Marcación agregada', data: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: editar / eliminar un registro de asistencia (requiere admin)
// ──────────────────────────────────────────────
// PUT /api/data/attendance/:id  body: { check_time: ISO, adminPassword }
// DELETE /api/data/attendance/:id  (adminPassword por header x-admin-password, body o query)
app.put('/api/data/attendance/:id', async (req, res) => {
  try {
    if (!checkAdminPassword(req)) {
      return res.status(401).json({ success: false, message: 'Se requiere contraseña de administrador' });
    }
    const id = parseInt(req.params.id);
    const { check_time } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    if (!check_time) return res.status(400).json({ success: false, message: 'check_time es requerido (YYYY-MM-DDTHH:mm)' });
    // La entrada es hora LOCAL del colegio (lo que ve el admin), la convertimos
    // a instante UTC con la zona del colegio, no con la de la PC servidor.
    const m = String(check_time).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return res.status(400).json({ success: false, message: 'check_time debe ser YYYY-MM-DDTHH:mm' });
    const dt = dateStrToSchoolInstant(`${m[1]}-${m[2]}-${m[3]}`, parseInt(m[4], 10), parseInt(m[5], 10));

    const { data, error } = await supabase
      .from('attendance_logs')
      .update({ check_time: dt.toISOString() })
      .eq('id', id)
      .select('id, user_id, check_time');
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Registro no encontrado' });
    res.json({ success: true, message: 'Asistencia actualizada', data: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/data/attendance/:id', async (req, res) => {
  try {
    if (!checkAdminPassword(req)) {
      return res.status(401).json({ success: false, message: 'Se requiere contraseña de administrador' });
    }
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    const { error } = await supabase.from('attendance_logs').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: user calendar (month view)
// ──────────────────────────────────────────────
app.get('/api/data/users/:id/calendar', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year y month son requeridos' });

    const settings = getSettings();
    const sched = await getUserSchedule(userId);
    const from = dateStrToSchoolInstant(`${year}-${String(month).padStart(2, '0')}-01`, 0, 0);
    const lastDayNum = new Date(Date.UTC(parseInt(year), parseInt(month), 0)).getUTCDate();
    const to = dateStrToSchoolInstant(
      `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`, 23, 59, 59
    );

    const { data: logs } = await supabase.from('attendance_logs').select('*')
      .eq('user_id', userId)
      .gte('check_time', from.toISOString())
      .lte('check_time', to.toISOString())
      .order('check_time', { ascending: true });

    const byDay = {};
    dedupeLogsByTimestamp(logs).forEach(log => {
      const d = new Date(log.check_time);
      const key = getDayKey(d);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push({ ...log, date: d });
    });

    const days = Object.entries(byDay).map(([date, entries]) => {
      entries.sort((a, b) => a.date - b.date);
      const groups = groupDoubleTaps(entries, settings);
      const collapsed = groups.map(g => g[0]);
      const rawTotal = entries.length;
      const groupedCount = rawTotal - collapsed.length;
      const { first, stray } = firstEffectivePunch(collapsed);
      const last = collapsed[collapsed.length - 1];
      const status = sched ? getUserDayStatus(first.date, sched, settings) : getDayStatus(first.date, settings);
      // Horas trabajadas: con 4+ marcas se descuenta el refrigerio; si el
      // intervalo supera el tope el dato es anómalo y se reporta null.
      let workHours = null;
      if (collapsed.length > 1) {
        const seg = collapsed.length >= 4
          ? (collapsed[1].date - collapsed[0].date) + (collapsed[3].date - collapsed[2].date)
          : (last.date - first.date);
        const raw = seg / (1000 * 60 * 60);
        if (raw > 0 && raw <= MAX_WORK_HOURS) workHours = raw.toFixed(1);
      }
      const needsReview = groupedCount > 0 || collapsed.length > 4 || stray;
      const reviewReason = stray
        ? 'Marca sospechosa'
        : groupedCount > 0
          ? 'Doble marcación'
          : collapsed.length > 4 ? 'Más de 4 marcas' : null;
      return {
        date,
        day: parseInt(date.slice(8, 10), 10),
        dayOfWeek: toSchoolDate(dateStrToSchoolInstant(date, 12, 0, 0)).getUTCDay(),
        checkIn: first.date.toISOString(),
        checkOut: collapsed.length > 1 ? last.date.toISOString() : null,
        totalChecks: rawTotal,
        status,
        lateMinutes: sched ? getUserLateMinutes(first.date, sched, settings) : getLateMinutes(first.date, settings),
        hoursWorked: workHours,
        needsReview,
        reviewReason
      };
    });

    // Count workdays in month SEGÚN EL HORARIO del usuario, en zona del colegio
    let workdays = 0;
    listSchoolDates(
      `${year}-${String(month).padStart(2, '0')}-01`,
      `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`
    ).forEach(dateStr => {
      const dow = toSchoolDate(dateStrToSchoolInstant(dateStr, 12, 0, 0)).getUTCDay();
      if (isExpectedWorkDaySync(sched, dow, dateStr)) workdays++;
    });

    res.json({
      success: true,
      data: {
        year: parseInt(year),
        month: parseInt(month),
        workdays,
        daysPresent: days.length,
        daysAbsent: Math.max(0, workdays - days.length),
        onTime: days.filter(d => d.status === 'on-time').length,
        late: days.filter(d => d.status === 'late').length,
        days
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: schedules (horarios personales)
// ──────────────────────────────────────────────

// GET /api/data/schedules → todos los horarios { userId: { days, lateTime, endTime, offDates } }
app.get('/api/data/schedules', async (req, res) => {
  try {
    const schedules = await getUserSchedulesSafe();
    const out = {};
    Object.entries(schedules).forEach(([uid, s]) => {
      out[uid] = scheduleToApi(s);
    });
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/data/users/:id/schedule
app.get('/api/data/users/:id/schedule', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'userId inválido' });
    const sched = await getUserSchedule(userId);
    res.json({ success: true, data: scheduleToApi(sched) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Guarda el horario de un usuario. Body: { days?, lateTime?: "HH:MM", endTime?:
// "HH:MM", offDates?: [..] } o { clear: true } para eliminarlo.
// Sin admin (igual que el cambio de grado): lo usa la pestaña Horarios.
app.post('/api/data/users/:id/schedule', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'userId inválido' });
    const { days, lateTime, endTime, offDates, area, shift, clear } = req.body || {};
    const has = k => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    const schedules = await getUserSchedulesSafe();

    if (clear) {
      delete schedules[userId];
    } else {
      const dayArr = has('days') && Array.isArray(days)
        ? [...new Set(days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
        : null;
      const offArr = has('offDates') && Array.isArray(offDates)
        ? [...new Set(offDates.map(String).filter(od => /^\d{4}-\d{2}-\d{2}$/.test(od)))]
        : null;
      const lateM = has('lateTime') ? parseTimeToMinutes(lateTime) : undefined;
      const endM = has('endTime') ? parseTimeToMinutes(endTime) : undefined;
      const areaTxt = has('area') ? String(area || '').trim().slice(0, 80) : undefined;
      const shiftV = has('shift') ? normalizeShift(shift) : undefined;
      const prev = schedules[userId] || {};
      const next = {
        days: dayArr != null ? dayArr : (prev.days || []),
        lateMinutes: lateM !== undefined ? lateM : (prev.lateMinutes ?? null),
        endMinutes: endM !== undefined ? endM : (prev.endMinutes ?? null),
        offDates: offArr != null ? offArr : (prev.offDates || []),
        area: areaTxt !== undefined ? areaTxt : (prev.area || ''),
        shift: shiftV !== undefined ? shiftV : (prev.shift || null)
      };
      const isEmpty = next.days.length === 0 && next.lateMinutes == null && next.endMinutes == null
        && next.offDates.length === 0 && !next.area && !next.shift;
      if (isEmpty) {
        return res.status(400).json({ success: false, message: 'No se recibió ningún parámetro de horario' });
      }
      schedules[userId] = normalizeSchedule(next);
    }

    await persistSchedule(userId, schedules[userId] || null, schedules);
    res.json({ success: true, data: scheduleToApi(schedules[userId] || null) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Aplica un horario a varios usuarios a la vez (edición masiva).
// Body: { userIds: [..], days?, lateTime?, endTime?, offDates?, area?, shift?, clear? }
app.post('/api/data/schedules/batch', async (req, res) => {
  try {
    const { userIds, days, lateTime, endTime, offDates, area, shift, clear } = req.body || {};
    const has = k => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'userIds array requerido' });
    }
    const ids = [...new Set(userIds.map(Number).filter(n => Number.isInteger(n)))];
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'userIds inválidos' });

    const schedules = await getUserSchedulesSafe();
    const dayArr = has('days') && Array.isArray(days)
      ? [...new Set(days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
      : null;
    const offArr = has('offDates') && Array.isArray(offDates)
      ? [...new Set(offDates.map(String).filter(od => /^\d{4}-\d{2}-\d{2}$/.test(od)))]
      : null;
    const lateM = has('lateTime') ? parseTimeToMinutes(lateTime) : undefined;
    const endM = has('endTime') ? parseTimeToMinutes(endTime) : undefined;
    const areaTxt = has('area') ? String(area || '').trim().slice(0, 80) : undefined;
    const shiftV = has('shift') ? normalizeShift(shift) : undefined;
    const nothingToDo = !clear && dayArr == null && offArr == null && lateM === undefined
      && endM === undefined && areaTxt === undefined && shiftV === undefined;

    for (const id of ids) {
      if (clear) delete schedules[id];
      else if (!nothingToDo) {
        const prev = schedules[id] || {};
        schedules[id] = normalizeSchedule({
          days: dayArr != null ? dayArr : (prev.days || []),
          lateMinutes: lateM !== undefined ? lateM : (prev.lateMinutes ?? null),
          endMinutes: endM !== undefined ? endM : (prev.endMinutes ?? null),
          offDates: offArr != null ? offArr : (prev.offDates || []),
          area: areaTxt !== undefined ? areaTxt : (prev.area || ''),
          shift: shiftV !== undefined ? shiftV : (prev.shift || null)
        });
      }
    }

    // Persistir de a uno (la tabla es por usuario)
    let saved = 0;
    for (const id of ids) {
      const row = schedules[id];
      if (row) {
        const ok = await persistSchedule(id, row, schedules);
        if (ok) saved++;
      } else {
        await persistSchedule(id, null, schedules);
        saved++;
      }
    }
    res.json({ success: true, count: ids.length, saved, message: `${ids.length} horarios actualizados` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// DATA: justificaciones (licencias, permisos, comisiones)
// ──────────────────────────────────────────────

// Lista las justificaciones, opcionalmente filtradas por período/persona.
app.get('/api/data/excuses', async (req, res) => {
  try {
    const { from, to, userId } = req.query;
    let list = await getExcusesSafe();
    if (userId) list = list.filter(e => e.userId === parseInt(userId));
    if (from) list = list.filter(e => e.day >= from);
    if (to) list = list.filter(e => e.day <= to);
    list.sort((a, b) => a.day.localeCompare(b.day) || a.userId - b.userId);
    res.json({
      success: true,
      count: list.length,
      data: list.map(excuseToApi),
      types: EXCUSE_TYPES.map(t => ({ value: t, label: EXCUSE_LABELS[t] })),
      shifts: SHIFTS.map(s => ({ value: s, label: SHIFT_LABELS[s] }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Registra/actualiza la justificación de una persona para un día.
app.post('/api/data/excuses', async (req, res) => {
  try {
    if (!checkAdminPassword(req)) {
      return res.status(401).json({ success: false, message: 'Se requiere contraseña de administrador' });
    }
    const { userId, date, type, document, note, coversLate } = req.body || {};
    const uid = parseInt(userId);
    if (!Number.isInteger(uid)) return res.status(400).json({ success: false, message: 'userId inválido' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      return res.status(400).json({ success: false, message: 'date inválida (YYYY-MM-DD)' });
    }
    const excuse = normalizeExcuse({
      userId: uid,
      day: date,
      type,
      document,
      note,
      coversLate: coversLate === undefined ? true : coversLate,
      createdAt: new Date().toISOString()
    });
    if (!excuse) return res.status(400).json({ success: false, message: 'Justificación inválida' });
    const saved = await upsertExcuse(excuse);
    res.json({ success: true, data: excuseToApi(saved), message: `Justificación registrada: ${getExcuseLabel(saved.type)}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quita la justificación de una persona para un día.
app.delete('/api/data/excuses', async (req, res) => {
  try {
    if (!checkAdminPassword(req)) {
      return res.status(401).json({ success: false, message: 'Se requiere contraseña de administrador' });
    }
    const uid = parseInt(req.query.userId);
    const day = String(req.query.date || '');
    if (!Number.isInteger(uid) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ success: false, message: 'userId y date (YYYY-MM-DD) son requeridos' });
    }
    await removeExcuse(uid, day);
    res.json({ success: true, message: 'Justificación eliminada' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Persiste un horario en Supabase (fuente de verdad) + JSON local + caché.
// Si la tabla no existe, o si no tiene las columnas area/shift, se degrada sin
// perder los horarios ya guardados (patrón idéntico al de los grados).
async function persistSchedule(userId, sched, schedulesMap) {
  const row = {
    user_id: userId,
    days: sched.days || [],
    late_minutes: sched.lateMinutes,
    end_minutes: sched.endMinutes,
    off_dates: sched.offDates || [],
    updated_at: new Date().toISOString()
  };
  try {
    if (sched) {
      const withExtra = { ...row, area: sched.area || '', shift: sched.shift || null };
      let error = null;
      if (scheduleExtraColumns) {
        ({ error } = await supabase.from('user_schedules').upsert(withExtra, { onConflict: 'user_id' }));
        if (error) scheduleExtraColumns = false;
      }
      if (!scheduleExtraColumns) {
        ({ error } = await supabase.from('user_schedules').upsert(row, { onConflict: 'user_id' }));
      }
      if (error) throw error;
    } else {
      const { error } = await supabase.from('user_schedules').delete().eq('user_id', userId);
      if (error) throw error;
    }
    scheduleCache = schedulesMap;
    saveLocalUserSchedules(schedulesMap);
    return true;
  } catch (err) {
    console.error('[Backend] Error guardando horario en Supabase:', err.message);
    // Aún así mantener el JSON local como respaldo y la caché actualizada
    scheduleCache = schedulesMap;
    saveLocalUserSchedules(schedulesMap);
    return false;
  }
}
// Estructura esperada de la tabla:
//   user_id      int  PK
//   parent_name  text nullable
//   phone        text not null        -- solo dígitos, sin '+'
//   updated_at   timestamptz default now()
//
// Si la tabla no existe en Supabase, los endpoints devolverán error
// y se logueará la sugerencia para crearla.

// Normaliza el teléfono a solo dígitos (sin +, espacios, guiones)
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // Si tiene 12-13 dígitos y empieza con 51 (Perú), conservar; sino devolver tal cual
  return digits.length > 0 ? digits : null;
}

// Valida formato básico: entre 9 y 15 dígitos
function isValidPhone(phone) {
  return phone && /^\d{9,15}$/.test(phone);
}

// GET /api/parent-contacts
// Lista todos los contactos (incluye datos básicos del estudiante desde users)
app.get('/api/parent-contacts', async (req, res) => {
  try {
    const { data: contacts, error } = await supabase
      .from('parent_contacts')
      .select('user_id, parent_name, phone, updated_at')
      .order('user_id', { ascending: true });
    if (error) {
      // Si la tabla no existe (PGRST205 / 42P01), devolver lista vacía + mensaje
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        return res.json({ success: false, message: 'La tabla parent_contacts no existe en Supabase', data: [] });
      }
      throw error;
    }
    // Combinar con nombre/grado del usuario
    await userCache.get();
    const userMap = userCache.getMap();
    const gradeMap = await userCache.getGradeMap();
    const enriched = (contacts || []).map(c => ({
      ...c,
      user_name: userMap[c.user_id] || `#${c.user_id}`,
      grade: gradeMap[c.user_id] || 'General'
    }));
    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/parent-contacts/:userId
app.get('/api/parent-contacts/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { data, error } = await supabase
      .from('parent_contacts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        return res.json({ success: true, data: null });
      }
      throw error;
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/parent-contacts/:userId
// Crea o actualiza el contacto de un estudiante
app.put('/api/parent-contacts/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'userId inválido' });
    const phone = normalizePhone(req.body.phone);
    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Teléfono inválido. Ingresa solo dígitos (9-15 caracteres).' });
    }
    const parentName = (req.body.parent_name || '').trim() || null;

    const row = {
      user_id: userId,
      phone,
      parent_name: parentName,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('parent_contacts')
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ success: true, message: 'Contacto guardado', data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/parent-contacts/:userId
app.delete('/api/parent-contacts/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { error } = await supabase
      .from('parent_contacts')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// STUDENT INCIDENTS — tardanzas e inasistencias
// ──────────────────────────────────────────────
// Devuelve para el rango de fechas (default = hoy) los estudiantes con:
//   - tardanzas (primer marca del día después del límite + tolerancia)
//   - inasistencias (registrados pero sin ninguna marca en el día)
// Solo incluye estudiantes (filtra por grado, excluye "Docentes / Personal" y "General")

function isStudentGrade(grade) {
  if (!grade) return false;
  const g = grade.toLowerCase();
  if (g.includes('docente') || g.includes('personal')) return false;
  return true;
}

app.get('/api/student-incidents', async (req, res) => {
  try {
    const { from, to, grade } = req.query;
    const settings = getSettings();
    await userCache.get();
    const gradeMap = await userCache.getGradeMap();
    const userMap = userCache.getMap();

    // Rango por defecto: hoy
    let fromDate, toDate;
    if (from && to) {
      fromDate = dateStrToSchoolInstant(from, 0, 0);
      toDate = dateStrToSchoolInstant(to, 23, 59, 59);
    } else {
      const nowKey = getDayKey(new Date());
      fromDate = dateStrToSchoolInstant(nowKey, 0, 0);
      toDate = dateStrToSchoolInstant(nowKey, 23, 59, 59);
    }

    // Traer marcas del rango (paginado: Supabase corta en 1000 filas)
    const logs = await fetchAllRows(() =>
      supabase.from('attendance_logs')
        .select('user_id, check_time')
        .gte('check_time', fromDate.toISOString())
        .lte('check_time', toDate.toISOString())
        .order('check_time', { ascending: true })
    );
    if (!logs) return res.status(500).json({ success: false, message: 'No se pudieron leer los registros' });

    // Agrupar por día y usuario
    const dayUserMap = {};
    logs.forEach(log => {
      const d = new Date(log.check_time);
      const dayKey = getDayKey(d);
      const key = `${dayKey}|${log.user_id}`;
      if (!dayUserMap[key]) dayUserMap[key] = { user_id: log.user_id, day: dayKey, times: [] };
      dayUserMap[key].times.push(d);
    });

    const incidents = [];
    Object.values(dayUserMap).forEach(rec => {
      const userGrade = gradeMap[rec.user_id] || 'General';
      // Filtrar por grado si el cliente lo pide
      if (grade && grade !== 'all' && !matchesGrade(userGrade, grade)) return;
      // Excluir no-estudiantes
      if (!isStudentGrade(userGrade)) return;

      rec.times.sort((a, b) => a - b);
      const first = firstEffectivePunch(rec.times.map(t => ({ date: t }))).first.date;
      const status = getDayStatus(first, settings);
      const { limitTotal, absentTotal } = getDayLimits(first, settings);

      if (status === 'late') {
        incidents.push({
          user_id: rec.user_id,
          user_name: userMap[rec.user_id] || `#${rec.user_id}`,
          grade: userGrade,
          date: rec.day,
          type: 'late',
          time: first.toISOString(),
          minutes_late: getLateMinutes(first, settings)
        });
      } else if (status === 'absent') {
        // Marcó por primera vez a partir de la hora de inasistencia (ej. 9:00):
        // es una falta, no una tardanza.
        const ft = getSchoolTotal(first);
        incidents.push({
          user_id: rec.user_id,
          user_name: userMap[rec.user_id] || `#${rec.user_id}`,
          grade: userGrade,
          date: rec.day,
          type: 'absent',
          time: first.toISOString(),
          minutes_late: 0,
          marked_after: `Marcó recién a las ${String(Math.floor(ft / 60)).padStart(2, '0')}:${String(ft % 60).padStart(2, '0')} (límite de inasistencia ${String(Math.floor(absentTotal / 60)).padStart(2, '0')}:${String(absentTotal % 60).padStart(2, '0')})`
        });
      }
    });

    // Calcular inasistencias: estudiantes que NO tienen marca en el día (solo día actual)
    // Para no romper el flujo, lo hacemos solo para el día actual (o último día del rango si es un día)
    const users = await userCache.get();
    const studentUsers = users.filter(u => isStudentGrade(u.grade) && (!grade || grade === 'all' || matchesGrade(u.grade, grade)));

    // Días laborables en el rango (lun-vie, excluyendo sábado y domingo)
    const fromKey = getDayKey(fromDate);
    const toKey = getDayKey(toDate);
    const workdays = listSchoolDates(fromKey, toKey).filter(dateStr => {
      const dow = toSchoolDate(dateStrToSchoolInstant(dateStr, 12, 0, 0)).getUTCDay();
      return dow !== 0 && dow !== 6;
    });

    const presentKeys = new Set(Object.keys(dayUserMap));
    studentUsers.forEach(u => {
      workdays.forEach(day => {
        const key = `${day}|${u.id}`;
        if (!presentKeys.has(key)) {
          incidents.push({
            user_id: u.id,
            user_name: u.name,
            grade: u.grade,
            date: day,
            type: 'absent',
            time: null,
            minutes_late: 0
          });
        }
      });
    });

    incidents.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.user_name.localeCompare(b.user_name);
    });

    res.json({
      success: true,
      count: incidents.length,
      data: incidents,
      range: { from: getDayKey(fromDate), to: getDayKey(toDate) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// WHATSAPP — abrir chat de WhatsApp Web
// ──────────────────────────────────────────────
// Construye la URL wa.me/<numero>?text=<mensaje> y la abre en el navegador
// predeterminado del sistema operativo. No envía nada automáticamente —
// el operador debe confirmar el envío en WhatsApp Web.
//
// Body: { phone, message, userName? }
// Devuelve: { success, url }
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Teléfono inválido' });
    }
    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'Mensaje vacío' });
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    // Abrir en el navegador predeterminado del SO.
    // Como el backend corre como proceso Node separado (no en Electron main),
    // usamos el comando nativo del sistema operativo.
    let cmd, args;
    if (os.platform() === 'win32') {
      // cmd /c start "" <url> — el "" es el título de la ventana (debe ir vacío)
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
    } else if (os.platform() === 'darwin') {
      cmd = 'open';
      args = [url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }

    let opened = false;
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true
      });
      child.on('error', () => { /* ignorar errores del browser */ });
      child.unref();
      opened = true;
    } catch (spawnErr) {
      console.warn('[WhatsApp] No se pudo abrir el navegador:', spawnErr.message);
      // No fallamos la request — devolvemos la URL para que el operador la copie
    }

    res.json({
      success: true,
      message: opened
        ? 'WhatsApp Web abierto en el navegador'
        : 'No se pudo abrir el navegador automáticamente. Copiá el enlace manualmente.',
      url,
      phone,
      userName: req.body.userName || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Plantilla de mensaje por defecto
// Params: { userName, date, type, time?, minutesLate? }
function buildDefaultMessage({ userName, date, type, time, minutesLate }) {
  // ─── MENSAJE DE PRUEBA — automatización de asistencia IEP Galileo ───
  // Plantilla provisional para validar el envío de avisos por WhatsApp
  // al padre de familia. Reemplazar más adelante con el mensaje definitivo.
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  if (type === 'absent') {
    return `🧪 *MENSAJE DE PRUEBA*\n\nEstimado padre de familia,\n\nLe saludamos desde la *Institución Educativa Privada Galileo* 👋\n\nLe informamos que, como parte del proceso de automatización de la asistencia del alumno/a *${userName}*, el día *${dateStr}* no se registró marcación de ingreso.\n\n✅ Este es un mensaje de *PRUEBA* del nuevo sistema automatizado de control de asistencia.\n\nSi tiene alguna consulta, por favor comuníquese con la institución.\n\nAtte.\n*Institución Educativa Privada Galileo*`;
  }
  // tardanza
  const timeStr = time ? new Date(time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
  return `🧪 *MENSAJE DE PRUEBA*\n\nEstimado padre de familia,\n\nLe saludamos desde la *Institución Educativa Privada Galileo* 👋\n\nLe informamos que, como parte del proceso de automatización de la asistencia del alumno/a *${userName}*, se registró un ingreso a las *${timeStr || 'hora no registrada'}* del día *${dateStr}*${minutesLate ? ` (${minutesLate} minutos después del horario establecido)` : ''}.\n\n✅ Este es un mensaje de *PRUEBA* del nuevo sistema automatizado de control de asistencia.\n\nAgradecemos su apoyo para fomentar la puntualidad.\n\nAtte.\n*Institución Educativa Privada Galileo*`;
}

app.post('/api/whatsapp/build-message', (req, res) => {
  try {
    const message = buildDefaultMessage(req.body || {});
    res.json({ success: true, data: { message } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// INCIDENTS
// ──────────────────────────────────────────────
app.get('/api/incidents', (req, res) => {
  res.json({ success: true, data: getIncidents() });
});

app.post('/api/incidents', (req, res) => {
  const { userId, date, type, description } = req.body;
  if (!userId || !date || !type) return res.status(400).json({ success: false, message: 'userId, date y type son requeridos' });

  const incidents = getIncidents();
  const incident = {
    id: Date.now(),
    userId: parseInt(userId),
    date,
    type, // 'forgot' | 'broken' | 'permission' | 'other'
    description: description || '',
    createdAt: new Date().toISOString()
  };
  incidents.push(incident);
  saveIncidents(incidents);
  res.json({ success: true, data: incident });
});

app.delete('/api/incidents/:id', (req, res) => {
  const id = parseInt(req.params.id);
  let incidents = getIncidents();
  incidents = incidents.filter(i => i.id !== id);
  saveIncidents(incidents);
  res.json({ success: true });
});

// ── Servir frontend estático (modo desktop / producción) ──────────────────────
// En desarrollo esto no aplica (Vite corre su propio servidor).
// En el .exe, el frontend compilado se copia junto al backend.
const FRONTEND_DIST = process.env.FRONTEND_DIST_PATH
  || path.join(__dirname, '..', 'zk-frontend', 'dist'); // dev fallback

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback para Express 5: rutas no-API devuelven index.html
  // Esto permite que React Router maneje las rutas del frontend
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
  console.log(`Sirviendo frontend desde: ${FRONTEND_DIST}`);
}

if (IS_SERVERLESS) {
  // Vercel importa el app como Serverless Function: no se debe abrir un puerto.
  module.exports = app;
} else {
  const server = app.listen(port, () => {
    console.log(`Backend corriendo en http://localhost:${port}`);
  });
  server.timeout = 120000; // 2 min for long-running ops (enroll takes up to 60s)
  module.exports = app;
}
