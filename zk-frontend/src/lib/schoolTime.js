// Formateo de horas/fechas SIEMPRE en la zona horaria del colegio, sin depender
// de la zona del navegador ni de la PC. El backend guarda las marcas como
// instantes UTC reales; aquí se desfasan con SCHOOL_TZ_OFFSET_MINUTES (default
// Perú = UTC-5 = -300) y se leen como "hora del colegio".

let offsetMinutes = (() => {
  const v = parseInt(import.meta.env.VITE_SCHOOL_TZ_OFFSET_MINUTES, 10);
  return Number.isNaN(v) ? -300 : v;
})();

export function setSchoolOffset(mins) {
  if (Number.isFinite(mins)) offsetMinutes = mins;
}

// Lee tzOffsetMinutes desde /api/settings para respetar la config del backend.
export async function loadSchoolOffset(apiBase) {
  try {
    const res = await fetch(`${apiBase}/settings`);
    const body = await res.json();
    if (body?.success && Number.isFinite(body.data?.tzOffsetMinutes)) {
      setSchoolOffset(body.data.tzOffsetMinutes);
    }
  } catch { /* se mantiene el default */ }
}

// Desplaza un instante UTC y devuelve un Date cuyos campos se leen con
// timeZone: 'UTC' (es decir, garantizan la hora del colegio).
export function toSchool(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + offsetMinutes * 60000);
}

export function formatSchoolTime(dateLike, { hour12 = false, seconds = false } = {}) {
  const d = toSchool(dateLike);
  if (!d) return '';
  return d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12,
    timeZone: 'UTC'
  });
}

export function formatSchoolDate(dateLike) {
  const d = toSchool(dateLike);
  if (!d) return '';
  return d.toLocaleDateString('es-PE', { timeZone: 'UTC' });
}

export function formatSchoolDateTime(dateLike) {
  const d = toSchool(dateLike);
  if (!d) return '';
  return d.toLocaleString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  });
}

export function schoolDayKey(dateLike) {
  const d = toSchool(dateLike);
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Da formato a una cadena YYYY-MM-DD que YA es fecha del colegio (sin conversión).
export function renderSchoolDateStr(dateStr, opts = {}) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('es-PE', {
    timeZone: 'UTC',
    ...opts
  });
}