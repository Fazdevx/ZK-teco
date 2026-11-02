// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del backend (fechas/husos/tardanzas/resúmenes).
// Extraída de index.js para poder testearla con `npm test` (node --test).
// No depende de Supabase ni del dispositivo: solo recibe datos y settings.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// Desplazamiento de la zona horaria del colegio (minutos respecto UTC).
// Perú = UTC-5 = -300. Lo fija index.js con setSchoolTzOffset según settings.json.
const DEFAULT_TZ_OFFSET = -300;
let runtimeTzOffset = null;

function setSchoolTzOffset(value) {
  runtimeTzOffset = (value !== undefined && value !== null && !isNaN(value)) ? value : null;
}

function getSchoolOffsetMinutes() {
  if (process.env.SCHOOL_TZ_OFFSET_MINUTES !== undefined && process.env.SCHOOL_TZ_OFFSET_MINUTES !== '') {
    const n = parseInt(process.env.SCHOOL_TZ_OFFSET_MINUTES, 10);
    if (!isNaN(n)) return n;
  }
  return runtimeTzOffset !== null && runtimeTzOffset !== undefined ? runtimeTzOffset : DEFAULT_TZ_OFFSET;
}

// Devuelve un Date cuyos campos getUTC* representan la hora local del colegio.
function toSchoolDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + getSchoolOffsetMinutes() * 60000);
}

// Minutos desde medianoche en hora del colegio (ej. 7:35 -> 455).
function getSchoolTotal(date) {
  const d = toSchoolDate(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Segundos desde medianoche en hora del colegio. La frontera on-time/late es
// EXACTA al segundo (llegar 1 s después del límite ya es tardanza); los minutos
// de descuento se truncan a enteros ver getLateMinutes.
function getSchoolTotalSeconds(date) {
  const d = toSchoolDate(date);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

// Clave de día (YYYY-MM-DD) en hora del colegio (NO UTC).
function getDayKey(date) {
  const d = toSchoolDate(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Convierte "YYYY-MM-DD" + hora del colegio en un instante UTC (para consultas a Supabase).
function dateStrToSchoolInstant(dateStr, hh, mm, ss) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const asSchoolUtc = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
  return new Date(asSchoolUtc - getSchoolOffsetMinutes() * 60000);
}

// Lista las claves de día (YYYY-MM-DD) del colegio entre fromStr y toStr (inclusive).
function listSchoolDates(fromStr, toStr) {
  const out = [];
  const step = 24 * 60 * 60000;
  let cur = dateStrToSchoolInstant(fromStr, 0, 0);
  const end = dateStrToSchoolInstant(toStr, 23, 59, 59);
  for (let c = cur; c <= end; c = new Date(c.getTime() + step)) out.push(getDayKey(c));
  return out;
}

// Convierte el Date que devuelve el lector (zklib-ng) al instante UTC real.
// decodeTime construye `new Date(y,m,d,h,min,s)` con la zona horaria LOCAL de la
// PC; sus campos getFullYear/getHours/... son la hora de pared del colegio (lo
// que el dispositivo mostró). Reconstruimos esos campos como hora del colegio y
// aplicamos tzOffsetMinutes para obtener el instante UTC correcto, sin depender
// de la zona horaria de la PC donde corre el backend.
function deviceTsToInstant(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return d;
  const utcWall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return new Date(utcWall - getSchoolOffsetMinutes() * 60000);
}

// Dedupe por (user_id, check_time) antes de agrupar (anti duplicados del lector).
function dedupeLogsByTimestamp(logs) {
  const seen = new Set();
  return (logs || []).filter(log => {
    const k = `${log.user_id}|${log.check_time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Marcas de madrugada (antes de las 4:00 AM hora del colegio) NO definen el
// estado del día: suelen ser escrituras con zona horaria equivocada (otra PC /
// caja vieja) o un toque accidental, y una "primera marca" así taparía una
// tardanza/falta real (descuento perdido). Se clasifica con la primera marca
// "plausible" (>= 4:00) y el día se señala como 'Marca sospechosa'.
const STRAY_PUNCH_SCHOOL_HOUR = 4;
function firstEffectivePunch(sortedLogs) {
  const threshold = STRAY_PUNCH_SCHOOL_HOUR * 3600;
  let stray = false;
  let first = (sortedLogs || [])[0] || null;
  for (const l of sortedLogs || []) {
    const t = l.date ? l.date : new Date(l.check_time);
    if (getSchoolTotalSeconds(t) >= threshold) return { first: l, stray };
    stray = true;
  }
  return { first, stray };
}

// Agrupa marcas consecutivas de un mismo usuario el mismo día que ocurren a
// menos de `doubleTapToleranceMinutes` (por defecto 1 min) asumiendo que son
// una doble marcación de huella. Se conserva la PRIMERA marca de cada grupo
// (la huella "real"); el resto son duplicados. Con tolerancia 0 no agrupa.
// Devuelve array de grupos (cada grupo es un array de logs ya ordenados).
function groupDoubleTaps(sortedLogs, settings) {
  const tolMin = Number(settings.doubleTapToleranceMinutes ?? 1);
  if (isNaN(tolMin) || tolMin <= 0) return (sortedLogs || []).map(l => [l]);
  const tol = tolMin * 60000;
  const groups = [];
  for (const log of sortedLogs || []) {
    const t = log.date ? log.date.getTime() : new Date(log.check_time).getTime();
    const head = groups.length ? groups[groups.length - 1][0] : null;
    if (head) {
      const ht = head.date ? head.date.getTime() : new Date(head.check_time).getTime();
      if (t - ht <= tol) { groups[groups.length - 1].push(log); continue; }
    }
    groups.push([log]);
  }
  return groups;
}

function getPunchType(date) {
  const t = getSchoolTotal(date);
  // Heurística simple (mantener compatibilidad)
  // 0-11:59 = entrada (AM), 12-23:59 = salida (PM)
  // 12:00 exacto se considera entrada (primer registro del día)
  return (t < 720 || t === 720) ? 'entry' : 'exit';
}

// Etiqueta detallada de la marca según su orden en el día.
// Se esperan 4 marcas:
//   1) entry       — Entrada
//   2) lunch_out   — Salida a refrigerio
//   3) lunch_in    — Regreso de refrigerio
//   4) exit        — Salida final
// Si el día tiene menos de 4 marcas, se asigna por posición:
//   primera=entry, última=exit, intermedias AM=lunch_in, PM=lunch_out.
function getPunchLabel(userDayLogs, currentLogIndex) {
  const total = userDayLogs.length;
  if (total === 0) return 'entry';

  if (currentLogIndex === 0) return 'entry';
  if (currentLogIndex === total - 1) return 'exit';

  const t = getSchoolTotal(new Date(userDayLogs[currentLogIndex].check_time));
  // Antes del mediodía (intermedio) = regreso de refrigerio
  if (t < 720) return 'lunch_in';
  // Después del mediodía (intermedio) = salida a refrigerio
  return 'lunch_out';
}

// Determina el tipo de marca según el orden del día.
// Se esperan 4 marcas por día:
//   1) Entrada
//   2) Salida a refrigerio
//   3) Regreso de refrigerio
//   4) Salida final
// Si hay menos marcas, se asigna por posición: primera=entrada, última=salida,
// intermedias: AM=entrada (regreso), PM=salida (salida a refrigerio).
function getSmartPunchType(userDayLogs, currentLogIndex) {
  const total = userDayLogs.length;
  if (total === 0) return 'entry';

  if (currentLogIndex === 0) return 'entry';
  if (currentLogIndex === total - 1) return 'exit';

  const t = getSchoolTotal(new Date(userDayLogs[currentLogIndex].check_time));

  // Antes del mediodía se considera regreso de refrigerio (entrada).
  if (t < 720) return 'entry';

  // Después del mediodía (intermedio) = salida a refrigerio.
  return 'exit';
}

function getStatus(date, settings) {
  const t = getSchoolTotal(date);
  const lateTotal = settings.lateHour * 60 + settings.lateMinute + settings.toleranceMinutes;
  return t <= lateTotal ? 'on-time' : 'late';
}

// Límites de un día según el día de la semana. Los SÁBADOS usan horario
// propio (saturdayLateHour/Minute y saturdayAbsenceAfterHour/Minute, ej.
// tardanza desde las 8:30); el resto de días usa la configuración general.
// Devuelve límites en minutos (limitTotal/absentTotal) y en segundos
// (limitSec/absentSec) — la comparación de estado usa segundos para no regalar
// tardanzas de pocos segundos por truncar. La tolerancia aplica TODOS los días.
function getDayLimits(date, settings) {
  const isSaturday = toSchoolDate(date).getUTCDay() === 6;
  const limitMin = isSaturday
    ? ((settings.saturdayLateHour ?? settings.lateHour ?? 8) || 0) * 60
      + ((settings.saturdayLateMinute ?? settings.lateMinute ?? 0) || 0) + (settings.toleranceMinutes || 0)
    : ((settings.lateHour ?? 8) || 0) * 60 + ((settings.lateMinute ?? 0) || 0) + (settings.toleranceMinutes || 0);
  const absentMin = isSaturday
    ? ((settings.saturdayAbsenceAfterHour ?? settings.absenceAfterHour ?? 9) || 0) * 60
      + ((settings.saturdayAbsenceAfterMinute ?? settings.absenceAfterMinute ?? 0) || 0)
    : ((settings.absenceAfterHour ?? 9) || 0) * 60 + ((settings.absenceAfterMinute ?? 0) || 0);
  return { isSaturday, limitTotal: limitMin, absentTotal: absentMin, limitSec: limitMin * 60, absentSec: absentMin * 60 };
}

// Estado de un DÍA según su PRIMERA marcación:
//  - 'on-time': llegó antes/igual al límite de tardanza (con tolerancia).
//  - 'late':    llegó después del límite pero antes del umbral de inasistencia.
//  - 'absent':  no hay marcación o la primera marca es a partir de la hora
//               de inasistencia (absenceAfterHour/absenceAfterMinute, ej. 9:00;
//               los sábados, saturdayAbsenceAfterHour/Minute).
// Solo la primera marca del día define el estado; las horas de salida no suman.
function getDayStatus(date, settings) {
  const punchSec = getSchoolTotalSeconds(date);
  const { limitSec, absentSec } = getDayLimits(date, settings);
  if (punchSec >= absentSec) return 'absent';
  return punchSec > limitSec ? 'late' : 'on-time';
}

// Minutos de tardanza acumulables: SOLO en el momento del ingreso (primera
// marcación del día) y SOLO si el día NO se considera inasistencia.
// Si marca a las 9:00 o después (límite de inasistencia), devuelve 0 (cuenta
// como falta, no como minutos). Las salidas / refrigerios / marcas adicionales
// NUNCA suman minutos.
// Minutos = MINUTOS COMPLETOS de demora (floor): 7:36:59 => 1 min, 7:36:00 => 1 min.
function getLateMinutes(date, settings) {
  const status = getDayStatus(date, settings);
  if (status !== 'late') return 0;
  const { limitSec } = getDayLimits(date, settings);
  return Math.floor((getSchoolTotalSeconds(date) - limitSec) / 60);
}

function formatLateMinutes(total) {
  if (!total || total <= 0) return '0 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

// Límites del día para un usuario. Si tiene hora límite de entrada propia, esa
// es la frontera (más la tolerancia global); la inasistencia (absenceAfter) y el
// resto siguen la config general.
function getUserDayLimits(date, schedule, settings) {
  const base = getDayLimits(date, settings);
  if (!schedule || schedule.lateMinutes == null) return base;
  const limitMin = Number(schedule.lateMinutes) + (Number(settings.toleranceMinutes) || 0);
  return {
    isSaturday: base.isSaturday,
    limitTotal: limitMin,
    absentTotal: base.absentTotal,
    limitSec: limitMin * 60,
    absentSec: base.absentSec
  };
}

function getUserDayStatus(date, schedule, settings) {
  const { limitSec, absentSec } = getUserDayLimits(date, schedule, settings);
  const punchSec = getSchoolTotalSeconds(date);
  if (punchSec >= absentSec) return 'absent';
  return punchSec > limitSec ? 'late' : 'on-time';
}

function getUserLateMinutes(date, schedule, settings) {
  const status = getUserDayStatus(date, schedule, settings);
  if (status !== 'late') return 0;
  const { limitSec } = getUserDayLimits(date, schedule, settings);
  return Math.floor((getSchoolTotalSeconds(date) - limitSec) / 60);
}

function getUserEndTotal(schedule, settings) {
  if (schedule && schedule.endMinutes != null) return Number(schedule.endMinutes);
  return (settings.workEndHour ?? 17) * 60 + (settings.workEndMinute ?? 0);
}

// Si el usuario tiene horario propio, decide si un día es laborable:
// offDates NO es laborable; days (0-6) define los días; sin days -> lun-vie.
function isExpectedWorkDaySync(schedule, dow, dateStr) {
  if (!schedule) return dow !== 0 && dow !== 6;
  if ((schedule.offDates || []).includes(dateStr)) return false;
  if (schedule.days && schedule.days.length > 0) return schedule.days.includes(dow);
  return dow !== 0 && dow !== 6;
}

// Tope de horas trabajadas por día (seguridad).
const MAX_WORK_HOURS = 16;

// ── Personal: justificaciones, turno y horas realmente laboradas ────────────

// Motivos de justificación admitidos. `licencia` cubre licencia médica, `comision`
// la comisión de servicio, etc. Cualquier valor desconocido se guarda como 'otro'.
const EXCUSE_TYPES = ['licencia', 'permiso', 'comision', 'vacaciones', 'remoto', 'onision', 'capacitacion', 'otro'];
const EXCUSE_LABELS = {
  licencia: 'Licencia médica',
  permiso: 'Permiso',
  comision: 'Comisión de servicio',
  vacaciones: 'Vacaciones',
  remoto: 'Trabajo remoto',
  onision: 'Onisión',
  capacitacion: 'Capacitación',
  otro: 'Otro'
};
const SHIFTS = ['manana', 'tarde', 'noche'];
const SHIFT_LABELS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

// Quita acentos y pasa a minúsculas para comparar lo que envía el frontend
// ("Mañana", "comisión") con los valores canónicos sin tilde.
function stripAccents(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeExcuseType(t) {
  const v = stripAccents(t);
  return EXCUSE_TYPES.includes(v) ? v : 'otro';
}

function getExcuseLabel(type) {
  const k = normalizeExcuseType(type);
  return EXCUSE_LABELS[k];
}

function normalizeShift(s) {
  const v = stripAccents(s);
  return SHIFTS.includes(v) ? v : null;
}

function getShiftLabel(s) {
  const k = normalizeShift(s);
  return k ? SHIFT_LABELS[k] : null;
}

// Separa los días sin marcación en justificados e injustificados según las
// justificaciones registradas para esa persona.
function splitAbsencesByExcuse(absentDays, excuseDates) {
  const excused = new Set((excuseDates || []).map(String));
  const justified = [];
  const unjustified = [];
  (absentDays || []).forEach(d => (excused.has(String(d)) ? justified : unjustified).push(d));
  return { justified, unjustified };
}

// Minutos de la jornada esperada de una persona (base para cumplimiento de turno
// y horas extra): su propio horario si tiene hora de entrada/salida, si no la
// configuración general del colegio.
function getExpectedWorkMinutes(schedule, settings) {
  const s = settings || {};
  const start = schedule && schedule.lateMinutes != null
    ? Number(schedule.lateMinutes)
    : (s.workStartHour ?? 8) * 60 + (s.workStartMinute ?? 0);
  const end = getUserEndTotal(schedule || null, s);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return end - start;
}

// Minutos REALES laborados (permanencia) en un día, a partir de la secuencia
// efectiva de marcas ya colapsadas: última marca menos primera marca. NO se
// descuentan descansos porque las marcas por sí solas no permiten distinguir un
// bloque largo de clase de una pausa larga; quien quiera el criterio con
// refrigerio usa `hoursWorked` (buildDaySummaries), que asume el patrón de 4
// marcas. Devuelve null si no hay salida conocida, si el día no tiene horas
// positivas o si el tramo supera el tope de seguridad.
function getWorkedMinutes(marks) {
  const times = (marks || [])
    .map(m => (m instanceof Date ? m.getTime() : new Date(m).getTime()))
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const uniq = times.filter((t, i) => i === 0 || t !== times[i - 1]);
  if (uniq.length < 2) return null;
  const span = (uniq[uniq.length - 1] - uniq[0]) / 60000;
  if (span <= 0 || span > MAX_WORK_HOURS * 60) return null;
  return Math.round(span);
}

// Minutos extra del día: lo que la ÚLTIMA marca supera la hora de salida
// configurada para esa persona (0 si salió antes o no hay salida).
function getExtraMinutes(marks, schedule, settings) {
  const times = (marks || [])
    .map(m => (m instanceof Date ? m.getTime() : new Date(m).getTime()))
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  const endTotal = getUserEndTotal(schedule || null, settings || {});
  const lastTotal = getSchoolTotal(new Date(times[times.length - 1]));
  const extra = lastTotal - endTotal;
  return extra > 0 ? extra : 0;
}

function minutesToDecimalHours(min) {
  if (min == null || Number.isNaN(min)) return null;
  return Math.round((min / 60) * 10) / 10;
}

// Resumen de planilla / RR.HH. de una persona en el período. Enriquece cada día
// con horas laboradas, horas extra y si está justificado, y devuelve los totales
// que consume el reporte (días laborados vs. esperados, horas, cumplimiento,
// tardanzas e inasistencias justificadas vs. injustificadas).
function buildPayrollSummary(input) {
  const src = input || {};
  const days = Array.isArray(src.days) ? src.days : [];
  const absentDays = Array.isArray(src.absentDays) ? src.absentDays : [];
  const schedule = src.schedule || null;
  const settings = src.settings || {};
  const excuseByDay = {};
  (src.excuses || []).forEach(e => {
    if (e && e.day) excuseByDay[String(e.day)] = e;
  });

  const daily = days.map(d => {
    const exc = excuseByDay[String(d.date)] || null;
    const coversLate = exc ? (exc.coversLate === undefined ? true : !!exc.coversLate) : false;
    return {
      ...d,
      workedMinutes: getWorkedMinutes(d.marks || []),
      extraMinutes: getExtraMinutes(d.marks || [], schedule, settings),
      excused: !!exc,
      excuseCoversLate: coversLate,
      excuseType: exc ? normalizeExcuseType(exc.excuseType || exc.type) : null,
      excuseLabel: exc ? getExcuseLabel(exc.excuseType || exc.type) : null
    };
  });

  const expectedDays = Number.isFinite(src.expectedDays) ? src.expectedDays : 0;
  const workedDays = daily.filter(d => d.status === 'on-time' || d.status === 'late').length;
  const workedMinutes = daily.reduce((a, d) => a + (d.workedMinutes || 0), 0);
  const extraMinutes = daily.reduce((a, d) => a + (d.extraMinutes || 0), 0);
  const lateExcused = daily.filter(d => d.excuseCoversLate).reduce((a, d) => a + (d.lateMinutes || 0), 0);
  const lateCharged = daily.filter(d => !d.excuseCoversLate).reduce((a, d) => a + (d.lateMinutes || 0), 0);
  const excusedLateDays = daily.filter(d => d.excuseCoversLate && (d.lateMinutes || 0) > 0).map(d => d.date);
  const { justified, unjustified } = splitAbsencesByExcuse(absentDays, (src.excuses || []).map(e => e && e.day).filter(Boolean));
  const expectedMinutesPerDay = getExpectedWorkMinutes(schedule, settings);
  const expectedMinutes = expectedMinutesPerDay == null ? null : expectedMinutesPerDay * expectedDays;
  const compliancePct = expectedMinutes && expectedMinutes > 0
    ? Math.min(100, Math.round((workedMinutes / expectedMinutes) * 100))
    : null;

  return {
    days: daily,
    expectedDays,
    workedDays,
    absentDaysCount: absentDays.length,
    workedMinutes,
    workedHours: minutesToDecimalHours(workedMinutes),
    workedTime: formatLateMinutes(workedMinutes),
    extraMinutes,
    extraHours: minutesToDecimalHours(extraMinutes),
    extraTime: formatLateMinutes(extraMinutes),
    lateMinutesTotal: lateExcused + lateCharged,
    lateMinutesExcused: lateExcused,
    lateMinutesCharged: lateCharged,
    excusedLateDays,
    absentJustifiedDays: justified,
    absentUnjustifiedDays: unjustified,
    absentJustifiedCount: justified.length,
    absentUnjustifiedCount: unjustified.length,
    expectedMinutesPerDay,
    expectedMinutes,
    compliancePct,
    shift: normalizeShift(schedule ? schedule.shift : null),
    area: schedule && schedule.area ? String(schedule.area) : null
  };
}

// Build day summaries from raw logs
function buildDaySummaries(logs, settings, schedule) {
  const byDay = {};
  dedupeLogsByTimestamp(logs).forEach(log => {
    const d = new Date(log.check_time);
    const key = getDayKey(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push({ ...log, date: d });
  });

  return Object.entries(byDay).map(([date, entries]) => {
    entries.sort((a, b) => a.date - b.date);
    // Agrupar dobles marcaciones para no romper el orden Entrada→Refrigerio→Salida
    const groups = groupDoubleTaps(entries, settings);
    const collapsed = groups.map(g => g[0]);
    const rawTotal = entries.length;
    const groupedCount = rawTotal - collapsed.length; // toques absorbidos
    const { first, stray } = firstEffectivePunch(collapsed);
    const last = collapsed[collapsed.length - 1];
    // Para el dashboard/estadísticas, basado en hora simple
    const firstType = getPunchType(first.date);
    const lastType = getPunchType(last.date);
    // Determinar las 4 marcas del día (si existen)
    const lunchOut = collapsed.length >= 3 ? collapsed[1] : null;
    const lunchIn = collapsed.length >= 4 ? collapsed[2] : (collapsed.length === 3 ? collapsed[1] : null);
    const status = schedule ? getUserDayStatus(first.date, schedule, settings) : getDayStatus(first.date, settings);
    const lateMinutes = schedule ? getUserLateMinutes(first.date, schedule, settings) : getLateMinutes(first.date, settings);
    // Horas trabajadas: con 4+ marcas se descuenta el refrigerio; si el
    // intervalo supera el tope (MAX_WORK_HOURS) el dato es anómalo y se reporta null.
    let workHours = null;
    if (collapsed.length > 1) {
      const seg = collapsed.length >= 4
        ? (collapsed[1].date - collapsed[0].date) + (collapsed[3].date - collapsed[2].date)
        : (last.date - first.date);
      const raw = seg / (1000 * 60 * 60);
      if (raw > 0 && raw <= MAX_WORK_HOURS) workHours = raw.toFixed(1);
    }
    // Día "a revisar": hubo doble marcación (auto-agrupada), marcas de madrugada
    // (posible zona horaria errada) o quedan más de 4 marcas efectivas.
    const needsReview = groupedCount > 0 || collapsed.length > 4 || stray;
    const reviewReason = stray
      ? 'Marca sospechosa'
      : groupedCount > 0
        ? 'Doble marcación'
        : collapsed.length > 4 ? 'Más de 4 marcas' : null;
    return {
      date,
      checkIn: first.date.toISOString(),
      checkInType: firstType,
      lunchOut: lunchOut ? lunchOut.date.toISOString() : null,
      lunchOutType: lunchOut ? 'exit' : null,
      lunchIn: lunchIn ? lunchIn.date.toISOString() : null,
      lunchInType: lunchIn ? 'entry' : null,
      checkOut: collapsed.length > 1 ? last.date.toISOString() : null,
      checkOutType: collapsed.length > 1 ? lastType : null,
      totalChecks: rawTotal,
      status,
      lateMinutes,
      hoursWorked: workHours,
      needsReview,
      reviewReason
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

module.exports = {
  setSchoolTzOffset,
  getSchoolOffsetMinutes,
  toSchoolDate,
  getSchoolTotal,
  getSchoolTotalSeconds,
  getDayKey,
  dateStrToSchoolInstant,
  listSchoolDates,
  deviceTsToInstant,
  dedupeLogsByTimestamp,
  firstEffectivePunch,
  groupDoubleTaps,
  getPunchType,
  getPunchLabel,
  getSmartPunchType,
  getStatus,
  getDayLimits,
  getDayStatus,
  getLateMinutes,
  formatLateMinutes,
  getUserDayLimits,
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
  minutesToDecimalHours,
  buildPayrollSummary,
  buildDaySummaries,
  MAX_WORK_HOURS,
  STRAY_PUNCH_SCHOOL_HOUR
};