import { useState, useEffect, useRef } from 'react';
import { formatSchoolTime, renderSchoolDateStr, schoolDayKey, loadSchoolOffset, toSchool } from './lib/schoolTime';

import { API } from './lib/apiBase';

// Configuración de marca del documento (persistida localmente).
const DEFAULT_DOC_CONFIG = {
  institution: '',          // nombre de la institución
  subTitle: '',             // subtítulo del encabezado
  docPrefix: 'REP',         // prefijo del N° de documento
  personLabel: '',          // "Alumno" / "Docente" / "Persona" ...
  personLabelPlural: '',    // "Alumnos" / "Docentes" / "Personas" ...
  groupLabel: '',           // "Grado" / "Área" / "Cargo" ...
  pdfFormat: 'detallado'    // 'detallado' = carátula + hoja por persona | 'consolidado' = lista única
};
const DOC_CONFIG_KEY = 'report-doc-config';

const SHIFT_LABELS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const getShiftLabel = (s) => (s && SHIFT_LABELS[s]) || '—';

const DOC_CSS = `
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Times New Roman', Times, serif; margin: 0; padding: 22px; color: #111827; font-size: 12px; line-height: 1.4; }
  /* ---- Hoja por persona: toda la hoja es una celda encerrada ---- */
  .doc-sheet { border: 2px solid #000; page-break-after: always; break-after: page; }
  .doc-sheet:last-child { page-break-after: auto; break-after: auto; }
  .doc-header { display: flex; align-items: center; gap: 16px; padding: 8px 12px; border-bottom: 1px solid #111827; }
  .doc-logo { width: 86px; text-align: center; }
  .doc-logo img { max-height: 70px; max-width: 86px; }
  .doc-title { flex: 1; text-align: center; }
  .doc-institution { font-size: 15px; font-weight: 800; letter-spacing: 0.5px; color: #000; text-transform: uppercase; }
  .doc-sub { font-size: 9px; color: #4b5563; margin-top: 2px; }
  .doc-type { display: inline-block; margin-top: 4px; padding: 2px 12px; background: #111827; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .doc-ref { font-size: 9px; color: #6b7280; margin-top: 4px; letter-spacing: 0.3px; }
  .doc-meta { min-width: 180px; font-size: 10.5px; color: #374151; line-height: 1.6; }
  .doc-meta b { display: block; color: #000; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
  /* Filtros: fila del grid (marca del documento sin emojis) */
  .filters { text-align: center; margin: 0; padding: 4px 6px; border-bottom: 1px solid #111827; background: #f9fafb; }
  .doc-tag { display: inline-block; padding: 4px 12px; border: 1px solid #111827; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 6px; background: #fff; color: #111827; }
  .filter-tags { margin: 0; }
  .filter-tags span { font-size: 10px; font-weight: 600; color: #111827; margin: 0 3px; }
  /* ---- Tablas: celdas del grid, unidas sin separación ---- */
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 0; }
  td, th { padding: 5px 8px; }
  th { background: #111827; color: #fff; padding: 6px 8px; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { border: 1px solid #111827; line-height: 1.4; }
  tr:nth-child(even) { background: #f9fafb; }
  /* ---- Título de sección: fila del grid, contigua a las tablas ---- */
  .section-title { margin: 0; padding: 6px 10px; background: #e5e7eb; color: #000; font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #111827; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  td, th { page-break-inside: avoid; break-inside: avoid; }
  /* ---- Identificación del trabajador ---- */
  .id-table th { font-size: 9.5px; padding: 6px 10px; vertical-align: middle; }
  .id-table td { padding: 6px 10px; font-size: 12px; font-weight: 700; }
  .id-table .name-cell { font-size: 15px; letter-spacing: 0.3px; }
  /* ---- Indicadores del trabajador (Resumen) ---- */
  .stats-table th { width: 18%; padding: 6px 10px; }
  .stats-table td { width: 32%; text-align: center; padding: 6px 10px; font-size: 13px; background: #fff; }
  .stats-table td b { font-size: 15px; color: #000; }
  .stats-table tr:nth-child(even) td { background: #f9fafb; }
  /* ---- Tabla diaria del trabajador ---- */
  .daily-table th { text-align: center; }
  .late-row td { background: #e5e7eb; }
  .empty-row td { text-align: center; color: #6b7280; font-size: 11px; padding: 12px; }
  /* ---- Notas / reglas: fila del grid ---- */
  .lines { font-size: 10.5px; color: #374151; padding: 7px 10px; border: 1px solid #111827; background: #fff; line-height: 1.5; }
  .lines .line-item { margin: 0; }
  .lines b { color: #000; }
  .empty-doc { padding: 40px; text-align: center; color: #6b7280; font-size: 13px; border: 2px solid #000; }
  /* ---- Pie de página: fila final del grid ---- */
  .footer { margin: 0; padding: 5px 10px; border-top: 1px solid #111827; background: #f9fafb; font-size: 8.5px; color: #4b5563; text-align: center; line-height: 1.5; }
  /* ---- Carátula / resumen consolidado ---- */
  .cover-body { padding: 12px; }
  .cover-title { margin: 0; padding: 8px 10px; background: #111827; color: #fff; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
  .cover-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .stat-cell { border: 1px solid #111827; padding: 10px 8px; text-align: center; }
  .stat-cell b { display: block; font-size: 20px; color: #000; }
  .stat-cell span { font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #374151; }
  .summary-table th, .summary-table td { text-align: center; }
  .summary-table td:first-child, .summary-table th:first-child { text-align: left; padding-left: 10px; }
  /* ---- Documento consolidado (lista en una sola hoja, fluye entre páginas) ---- */
  .doc-flow { border: 2px solid #000; border-bottom-width: 1px; }
  .doc-flow .section-title { page-break-after: avoid; break-after: avoid; }
  .doc-flow .cover-body { padding: 10px; }
  .doc-flow .signatures { page-break-inside: avoid; break-inside: avoid; }
  .list-table th, .list-table td { text-align: center; }
  .list-table .name-cell, .list-table .grade-cell { text-align: left; }
  .list-table .abs-cell { font-weight: 700; color: #000; }
  .list-table .zero-cell { color: #9ca3af; }
  .list-table tfoot td { background: #e5e7eb; font-weight: 800; border-top: 2px solid #111827; }
  .day-table td.names-cell { text-align: left; font-size: 10.5px; line-height: 1.45; }
  .day-table td.count-cell { font-weight: 800; font-size: 12px; }
  .empty-note { padding: 10px; border: 1px solid #111827; background: #fff; color: #6b7280; font-size: 11px; text-align: center; }
  /* ---- Firmas ---- */
  .signatures { display: flex; gap: 40px; justify-content: space-between; margin-top: 24px; }
  .sig-box { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #111827; height: 42px; margin: 0 10px 6px; }
  .sig-box div:last-child { font-size: 10px; color: #374151; }
  @media print { body { padding: 0; } }
`;

export default function Report({ setError }) {
  const [users, setUsers] = useState([]);
  const [grades, setGrades] = useState([]);
  const [report, setReport] = useState(null);
  const [reportTotals, setReportTotals] = useState(null);
  const [lateLimit, setLateLimit] = useState(null);
  const [saturdayLateLimit, setSaturdayLateLimit] = useState(null);
  const [absentAfter, setAbsentAfter] = useState(null);
  const [saturdayAbsentAfter, setSaturdayAbsentAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [docConfig, setDocConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOC_CONFIG_KEY) || '{}');
      return { ...DEFAULT_DOC_CONFIG, ...saved };
    } catch {
      return DEFAULT_DOC_CONFIG;
    }
  });
  const [filters, setFilters] = useState({
    from: schoolDayKey(new Date()),
    to: schoolDayKey(new Date()),
    userId: '',
    grades: ['secundaria_alta'], // multi-selección: ej. ['General', 'Docentes / Personal']
    studentCategory: 'all', // 'all', 'general', 'no-general'
    onlyLate: false, // Show only students with late arrivals
    onlyAbsent: false, // Show only students without attendance
    onlyUnjustified: false, // Show only people with unjustified absences
    onlyReview: false, // Show only users with days to review (doble marcación / >4 marcas)
    showTimes: false, // Show detailed marks in the printed report
    showCheckout: true, // Show the check-out (salida) column in the printed report
    showLateMinutes: true, // Mostrar columna de minutos tardados acumulados
    showPayroll: true, // Mostrar resumen de planilla (RR.HH.) en reportes de personal
    selectedUsers: {} // Map<user_id, bool> — per-row inclusion in the report
  });
  const [excuses, setExcuses] = useState([]);
  const [excuseTypes, setExcuseTypes] = useState([]);
  const [excuseForm, setExcuseForm] = useState({ userId: '', date: '', type: 'licencia', document: '', note: '', coversLate: true });
  const [excuseOpen, setExcuseOpen] = useState(false);
  const [savingExcuse, setSavingExcuse] = useState(false);
  const [adminPass, setAdminPass] = useState(() => sessionStorage.getItem('zk_admin_pass') || '');
  const printRef = useRef();

  useEffect(() => {
    try { localStorage.setItem(DOC_CONFIG_KEY, JSON.stringify(docConfig)); } catch { /* sin storage */ }
  }, [docConfig]);

  const buildParams = (f) => {
    const params = new URLSearchParams({ from: f.from, to: f.to });
    if (f.userId) params.set('userId', f.userId);
    if (f.grades && f.grades.length > 0) params.set('grade', f.grades.join(','));
    return params;
  };

  useEffect(() => {
    loadSchoolOffset(API);
    fetch(`${API}/data/users`)
      .then(r => r.json())
      .then(r => { if (r.success) setUsers(r.data); })
      .catch(() => {});
    fetch(`${API}/data/grades`)
      .then(r => r.json())
      .then(r => { if (r.success) setGrades(r.data.grades || []); })
      .catch(() => {});
  }, []);

  const fetchReport = async () => {
    if (!filters.from || !filters.to) return;
    setLoading(true);
    try {
      const params = buildParams(filters);
      const r = await (await fetch(`${API}/data/report?${params}`)).json();
      if (r.success) { setReport(r.data); setReportTotals(r.totals || null); setLateLimit(r.lateLimit || null); setSaturdayLateLimit(r.saturdayLateLimit || null); setAbsentAfter(r.absentAfter || null); setSaturdayAbsentAfter(r.saturdayAbsentAfter || null); }
      else setError(r.message);
    } catch { setError('Error al generar reporte'); }
    finally { setLoading(false); }
  };

  const loadExcuses = async (f) => {
    const params = new URLSearchParams({ from: f.from, to: f.to });
    try {
      const r = await (await fetch(`${API}/data/excuses?${params}`)).json();
      if (r.success) {
        setExcuses(r.data || []);
        if ((r.types || []).length > 0) setExcuseTypes(r.types);
      }
    } catch { /* sin justificaciones */ }
  };

  const saveExcuse = async () => {
    if (!excuseForm.userId || !excuseForm.date) { setError('Selecciona la persona y la fecha'); return; }
    setSavingExcuse(true);
    try {
      const r = await (await fetch(`${API}/data/excuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPass },
        body: JSON.stringify(excuseForm)
      })).json();
      if (!r.success) { setError(r.message); return; }
      setExcuseForm(f => ({ ...f, document: '', note: '' }));
      setExcuseOpen(false);
      await Promise.all([loadExcuses(filters), fetchReport()]);
    } catch { setError('Error al registrar la justificación'); }
    finally { setSavingExcuse(false); }
  };

  const deleteExcuse = async (userId, day) => {
    try {
      const r = await (await fetch(`${API}/data/excuses?userId=${userId}&date=${day}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPass }
      })).json();
      if (!r.success) { setError(r.message); return; }
      await Promise.all([loadExcuses(filters), fetchReport()]);
    } catch { setError('Error al eliminar la justificación'); }
  };

  // Initial load on mount — fetch once
  const [initialLoading, setInitialLoading] = useState(true);
  useEffect(() => {
    const params = buildParams(filters);
    fetch(`${API}/data/report?${params}`)
      .then(r => r.json())
      .then(r => { if (r.success) { setReport(r.data); setReportTotals(r.totals || null); setLateLimit(r.lateLimit || null); setSaturdayLateLimit(r.saturdayLateLimit || null); setAbsentAfter(r.absentAfter || null); setSaturdayAbsentAfter(r.saturdayAbsentAfter || null); } })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    loadExcuses(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGradeSel = (g) => {
    setFilters(p => ({
      ...p,
      grades: p.grades.includes(g) ? p.grades.filter(x => x !== g) : [...p.grades, g]
    }));
  };

  const formatLate = (mins) => {
    if (!mins || mins <= 0) return '0 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  };

  const formatAbsentDate = (date) => renderSchoolDateStr(date, { day: '2-digit', month: '2-digit' });

  // Hora límite de ingreso exacta de un día con tardanza (checkIn − minutos tarde).
  const lateLimitOf = (d) => {
    if (!d.checkIn || !d.lateMinutes) return '—';
    const t = toSchool(d.checkIn);
    const lim = new Date(t.getTime() - d.lateMinutes * 60000);
    return lim.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  };

  // Tardanzas agrupadas por persona (una fila por persona con la lista de sus
  // tardanzas: fecha + hora límite → hora real de llegada + minutos). Se usa en
  // la previsualización y en el anexo imprimible, respetando los filtros activos.
  const getLateGrouped = () => {
    const groups = [];
    (getFilteredReport() || []).forEach(user => {
      const events = (user.days || []).filter(d => d.status === 'late').map(d => ({
        date: d.date,
        dateShort: renderSchoolDateStr(d.date, { day: '2-digit', month: '2-digit', year: '2-digit' }),
        weekday: renderSchoolDateStr(d.date, { weekday: 'short' }),
        limit: lateLimitOf(d),
        checkIn: formatTime(d.checkIn),
        mins: d.lateMinutes || 0
      }));
      if (events.length === 0) return;
      groups.push({
        user_id: user.user_id,
        name: user.name,
        grade: user.grade || 'General',
        count: events.length,
        totalMins: events.reduce((s, e) => s + e.mins, 0),
        events
      });
    });
    return groups;
  };

  // Inasistencias agrupadas por fecha: una fila por día con la lista de quién no
  // llegó. Es el formato de "lista de inasistencias" del documento consolidado.
  const getAbsencesByDay = () => {
    const byDate = new Map();
    (getFilteredReport() || []).forEach(user => {
      (user.absentDays || []).forEach(d => {
        if (!byDate.has(d)) byDate.set(d, { date: d, items: [] });
        byDate.get(d).items.push({ name: user.name, grade: user.grade || 'General' });
      });
    });
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(g => ({
        date: g.date,
        weekday: renderSchoolDateStr(g.date, { weekday: 'long' }),
        count: g.items.length,
        items: g.items
      }));
  };

  const getGradeLabel = (g) => {
    if (!g) return 'Todos los grados';
    if (g === 'secundaria_alta') return '3°, 4° y 5° de Secundaria';
    return g;
  };

  const getGradesLabel = (list) => {
    if (!list || list.length === 0) return 'Todos los grados';
    return list.map(getGradeLabel).join(' + ');
  };

  // Detecta el tipo de audiencia del reporte según el grado/filtros
  // para adaptar etiquetas y copy ("Alumno" vs "Docente", etc.). La marca
  // configurable (docConfig) puede sobrescribir los valores por defecto.
  const getReportAudience = () => {
    const gs = filters.grades || [];
    if (gs.length > 1) {
      return {
        kind: 'mixto',
        personLabel: 'Persona',
        personLabelPlural: 'Personas',
        groupLabel: 'Grado / Área',
        titlePrefix: 'REPORTE DE ASISTENCIA',
        subTitle: 'Educación Básica Regular',
        accent: '#f97316',
        accentLight: '#fff7ed',
        accentBorder: '#fed7aa',
        daysLabel: 'Días',
        checkoutLabel: 'Con salida',
        showPunctuality: true,
        showCheckout: true
      };
    }
    if (gs.length === 1 && gs[0] === 'Docentes / Personal') {
      return {
        kind: 'docentes',
        personLabel: 'Docente',
        personLabelPlural: 'Docentes',
        groupLabel: 'Área / Cargo',
        titlePrefix: 'REPORTE DE ASISTENCIA - PERSONAL',
        subTitle: 'Personal docente y administrativo',
        accent: '#7c3aed',
        accentLight: '#f5f3ff',
        accentBorder: '#ddd6fe',
        daysLabel: 'Días laborados',
        checkoutLabel: 'Con salida',
        showPunctuality: false,
        showCheckout: true
      };
    }
    if (gs.length === 1 && gs[0] === 'General') {
      return {
        kind: 'general',
        personLabel: 'Persona',
        personLabelPlural: 'Personas',
        groupLabel: 'Categoría',
        titlePrefix: 'REPORTE DE ASISTENCIA - GENERAL',
        subTitle: 'Comunidad educativa',
        accent: '#0f766e',
        accentLight: '#f0fdfa',
        accentBorder: '#99f6e4',
        daysLabel: 'Días',
        checkoutLabel: 'Con salida',
        showPunctuality: true,
        showCheckout: true
      };
    }
    return {
      kind: 'alumnos',
      personLabel: 'Alumno',
      personLabelPlural: 'Alumnos',
      groupLabel: 'Grado / Área',
      titlePrefix: 'REPORTE DE ASISTENCIA',
      subTitle: 'Educación Básica Regular',
      accent: '#f97316',
      accentLight: '#fff7ed',
      accentBorder: '#fed7aa',
      daysLabel: 'Días',
      checkoutLabel: 'Con salida',
      showPunctuality: true,
      showCheckout: true
    };
  };

  const audience = (() => {
    const base = getReportAudience();
    return {
      ...base,
      personLabel: docConfig.personLabel || base.personLabel,
      personLabelPlural: docConfig.personLabelPlural || base.personLabelPlural,
      groupLabel: docConfig.groupLabel || base.groupLabel,
      subTitle: docConfig.subTitle || base.subTitle
    };
  })();

  // El resumen de planilla (RR.HH.) solo tiene sentido para personal: en reportes
  // de alumnos no se muestra aunque el toggle esté activo.
  const isPersonnel = audience.kind !== 'alumnos';
  const showPayroll = filters.showPayroll && isPersonnel;

  // Área/cargo real de la persona (Horarios) y, si no tiene, el grupo del backend.
  const getAreaOf = (u) => u.area || u.grade || 'General';

  // Fila de planilla por persona, con los totales que pide RR.HH.
  const getPayrollRows = (opts) => (getFilteredReport(opts) || []).map(u => ({
    user_id: u.user_id,
    name: u.name,
    area: getAreaOf(u),
    shift: u.shift || null,
    expectedDays: u.expectedDays || 0,
    workedDays: u.workedDays || 0,
    workedTime: u.workedTime || '0 min',
    workedHours: u.workedHours ?? 0,
    extraTime: u.extraTime || '0 min',
    extraMinutes: u.extraMinutes || 0,
    compliancePct: u.compliancePct ?? null,
    lateCharged: u.lateMinutesCharged ?? (u.totalLateMinutes || 0),
    lateExcused: u.lateMinutesExcused || 0,
    absentJustified: u.justifiedAbsenceCount || 0,
    absentUnjustified: u.unjustifiedAbsenceCount || 0
  }));

  const getPayrollTotals = (opts) => getPayrollRows(opts).reduce((a, r) => ({
    people: a.people + 1,
    expectedDays: a.expectedDays + r.expectedDays,
    workedDays: a.workedDays + r.workedDays,
    workedMinutes: a.workedMinutes + (report?.find?.(x => x.user_id === r.user_id)?.workedMinutes || 0),
    extraMinutes: a.extraMinutes + r.extraMinutes,
    lateCharged: a.lateCharged + r.lateCharged,
    lateExcused: a.lateExcused + r.lateExcused,
    absentJustified: a.absentJustified + r.absentJustified,
    absentUnjustified: a.absentUnjustified + r.absentUnjustified
  }), { people: 0, expectedDays: 0, workedDays: 0, workedMinutes: 0, extraMinutes: 0, lateCharged: 0, lateExcused: 0, absentJustified: 0, absentUnjustified: 0 });

  // Resumen por área (para el acta y las firmas por responsable de área).
  const getByArea = (opts) => {
    const map = {};
    getPayrollRows(opts).forEach(r => {
      if (!map[r.area]) {
        map[r.area] = { area: r.area, people: 0, names: [], expectedDays: 0, workedDays: 0, workedMinutes: 0, extraMinutes: 0, lateCharged: 0, lateExcused: 0, absentJustified: 0, absentUnjustified: 0 };
      }
      const g = map[r.area];
      g.people += 1;
      g.names.push(r.name);
      g.expectedDays += r.expectedDays;
      g.workedDays += r.workedDays;
      const src = report?.find?.(x => x.user_id === r.user_id);
      g.workedMinutes += src?.workedMinutes || 0;
      g.extraMinutes += r.extraMinutes;
      g.lateCharged += r.lateCharged;
      g.lateExcused += r.lateExcused;
      g.absentJustified += r.absentJustified;
      g.absentUnjustified += r.absentUnjustified;
    });
    return Object.values(map).sort((a, b) => a.area.localeCompare(b.area));
  };

  // Todas las justificaciones del período, con nombre y área para mostrar.
  const getExcusesInRange = () => (excuses || [])
    .filter(e => e.day >= filters.from && e.day <= filters.to)
    .map(e => {
      const u = (report || []).find(x => x.user_id === e.userId);
      return { ...e, name: u?.name || '', area: u ? getAreaOf(u) : '—' };
    });

  const dowOfDate = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return -1;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  };

  // Solo se contabilizan días laborables: lunes a viernes (pantalla, impreso y
  // CSV). El domingo nunca cuenta.
  const isMonFri = (dateStr) => {
    const dow = dowOfDate(dateStr);
    return dow >= 1 && dow <= 5;
  };

  // El Excel exporta con { saturdays: true }: además de L–V cuenta los sábados
  // (el backend los clasifica con sus propios límites de tarde/inasistencia).
  const isMonSat = (dateStr) => {
    const dow = dowOfDate(dateStr);
    return dow >= 1 && dow <= 6;
  };

  // Filter report data based on active filters
  const getFilteredReport = (opts = {}) => {
    if (!report) return [];
    const keepDay = opts.saturdays ? isMonSat : isMonFri;

    return report
      // Descarta los días que no cuenta esta salida (domingos siempre; los
      // sábados se descartan salvo en el Excel).
      .map(user => ({ ...user, days: (user.days || []).filter(d => keepDay(d.date)) }))
      .filter(user => {
      // Filter by student category
      if (filters.studentCategory === 'general' && user.grade !== 'General') return false;
      if (filters.studentCategory === 'no-general' && user.grade === 'General') return false;

      // Filter by late arrivals
      if (filters.onlyLate) {
        const lateCount = user.days.filter(d => d.status === 'late').length;
        if (lateCount === 0) return false;
      }

      // Filter by absent (≥1 absent day in period)
      if (filters.onlyAbsent) {
        const absentCount = (user.absentDays || []).length;
        if (absentCount === 0) return false;
      }

      // Filter by absences WITHOUT justification (RR.HH.: lo que sí se descuenta)
      if (filters.onlyUnjustified) {
        if ((user.unjustifiedAbsenceCount || 0) === 0) return false;
      }

      // Filter by days to review (doble marcación automática / más de 4 marcas)
      if (filters.onlyReview) {
        if ((user.reviewDays || 0) === 0) return false;
      }

      // Per-row inclusion toggle (skip if explicitly unchecked)
      if (filters.selectedUsers[user.user_id] === false) return false;

      return true;
    });
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return formatSchoolTime(iso);
  };

  // Secuencia efectiva de marcas del día (tras colapsar dobles toques).
  const formatMarks = (d) => {
    if (!Array.isArray(d.marks) || d.marks.length === 0) return '';
    return d.marks.map(formatTime).join(' · ');
  };

  const downloadBlob = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Construye el documento completo (carátula + hoja por persona) en HTML.
  const buildDocument = () => {
    const filtered = getFilteredReport();

    let logoHtml = '';
    const logoImg = document.getElementById('report-logo');
    if (logoImg && logoImg.src) {
      logoHtml = `<img src="${logoImg.src}" style="max-height:80px;margin-bottom:8px;" />`;
    }

    const institution = docConfig.institution.trim() || audience.titlePrefix;
    const dateTitle = filters.from === filters.to
      ? `Fecha: ${renderSchoolDateStr(filters.from, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
      : `Período del ${renderSchoolDateStr(filters.from)} al ${renderSchoolDateStr(filters.to)}`;

    const gradeSubtitle = (filters.grades && filters.grades.length > 0)
      ? `<div class="doc-tag">${audience.groupLabel.toUpperCase()}: ${getGradesLabel(filters.grades).toUpperCase()}</div>`
      : '';

    // Etiquetas de filtro activos — texto plano, sin emojis en el documento.
    const filterLabels = [];
    if (filters.studentCategory !== 'all') {
      filterLabels.push(filters.studentCategory === 'general' ? 'Solo General' : 'Grado específico');
    }
    if (filters.onlyLate) filterLabels.push('Solo tardanzas');
    if (filters.onlyAbsent) filterLabels.push('Solo inasistencias');
    if (filters.onlyReview) filterLabels.push('Solo a revisar');
    const filterTagsHtml = filterLabels.length > 0
      ? `<div class="filter-tags">${filterLabels.map(l => `<span>${l}</span>`).join(' ')}</div>`
      : '';

    const issuedOn = new Date().toLocaleString('es-PE');
    const docNumber = `${docConfig.docPrefix || 'REP'}-${filters.from.replace(/-/g, '')}-${filters.to.replace(/-/g, '')}`;

    const dayShortNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const periodShort = filters.from === filters.to
      ? renderSchoolDateStr(filters.from, { day: '2-digit', month: '2-digit', year: 'numeric' })
      : `${renderSchoolDateStr(filters.from, { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${renderSchoolDateStr(filters.to, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

    // Acumulados del período sobre los datos filtrados.
    const agg = filtered.reduce((a, u) => {
      const pDays = (u.days || []).length;
      const onTime = (u.days || []).filter(d => d.status === 'on-time').length;
      return {
        users: a.users + 1,
        days: a.days + pDays,
        onTime: a.onTime + onTime,
        late: a.late + (u.lateDays || (u.days || []).filter(d => d.status === 'late').length),
        lateMins: a.lateMins + (u.days || []).reduce((s, d) => s + (d.lateMinutes || 0), 0),
        absent: a.absent + (u.absentDays || []).length,
        absentJust: a.absentJust + (u.justifiedAbsenceCount || 0),
        absentUnjust: a.absentUnjust + (u.unjustifiedAbsenceCount || 0),
        lateCharged: a.lateCharged + (u.lateMinutesCharged ?? (u.days || []).reduce((s, d) => s + (d.lateMinutes || 0), 0)),
        lateExcused: a.lateExcused + (u.lateMinutesExcused || 0),
        expectedDays: a.expectedDays + (u.expectedDays || 0),
        workedDays: a.workedDays + (u.workedDays || 0),
        workedMins: a.workedMins + (u.workedMinutes || 0),
        expectedMins: a.expectedMins + (u.expectedMinutes || 0),
        extraMins: a.extraMins + (u.extraMinutes || 0),
        review: a.review + (u.reviewDays || 0),
        punctAcc: a.punctAcc + (pDays > 0 ? (onTime / pDays) * 100 : 0),
        punctCount: a.punctCount + (pDays > 0 ? 1 : 0)
      };
    }, { users: 0, days: 0, onTime: 0, late: 0, lateMins: 0, absent: 0, absentJust: 0, absentUnjust: 0, lateCharged: 0, lateExcused: 0, expectedDays: 0, workedDays: 0, workedMins: 0, expectedMins: 0, extraMins: 0, review: 0, punctAcc: 0, punctCount: 0 });
    const punctAvg = agg.punctCount > 0 ? Math.round(agg.punctAcc / agg.punctCount) : 0;
    const complianceAvg = agg.expectedMins > 0 ? Math.min(100, Math.round((agg.workedMins / agg.expectedMins) * 100)) : null;

    // Para personal se agrupa por área/cargo real; para alumnos, por grado.
    const groupKeyOf = (u) => (showPayroll ? getAreaOf(u) : (u.grade || 'General'));
    const byGrade = {};
    filtered.forEach(u => {
      const g = groupKeyOf(u);
      if (!byGrade[g]) byGrade[g] = { users: 0, late: 0, absent: 0, review: 0, just: 0, unjust: 0, workedMins: 0, extraMins: 0 };
      byGrade[g].users += 1;
      byGrade[g].late += (u.lateDays || (u.days || []).filter(d => d.status === 'late').length);
      byGrade[g].absent += (u.absentDays || []).length;
      byGrade[g].just += (u.justifiedAbsenceCount || 0);
      byGrade[g].unjust += (u.unjustifiedAbsenceCount || 0);
      byGrade[g].workedMins += (u.workedMinutes || 0);
      byGrade[g].extraMins += (u.extraMinutes || 0);
      byGrade[g].review += (u.reviewDays || 0);
    });
    const gradeRows = Object.entries(byGrade)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([g, v]) => `
        <tr>
          <td>${g}</td>
          <td style="text-align:center;">${v.users}</td>
          <td style="text-align:center;">${v.late}</td>
          <td style="text-align:center;">${v.absent}${showPayroll ? `<br><span style="font-size:9px;">${v.just} just. / ${v.unjust} sin just.</span>` : ''}</td>
          <td style="text-align:center;">${v.review > 0 ? v.review : '—'}</td>
        </tr>
      `).join('');

    // Tabla de planilla (RR.HH.): una fila por persona + fila de TOTALES.
    const payrollRows = getPayrollRows();
    const payrollFoot = payrollRows.reduce((a, r) => ({
      expectedDays: a.expectedDays + r.expectedDays,
      workedDays: a.workedDays + r.workedDays,
      workedMins: a.workedMins + (filtered.find(u => u.user_id === r.user_id)?.workedMinutes || 0),
      extraMins: a.extraMins + r.extraMinutes,
      lateCharged: a.lateCharged + r.lateCharged,
      lateExcused: a.lateExcused + r.lateExcused,
      just: a.just + r.absentJustified,
      unjust: a.unjust + r.absentUnjustified
    }), { expectedDays: 0, workedDays: 0, workedMins: 0, extraMins: 0, lateCharged: 0, lateExcused: 0, just: 0, unjust: 0 });

    const payrollTable = `
      <div class="section-title">Resumen de planilla / RR.HH. — control de asistencia del personal</div>
      <table class="list-table">
        <thead><tr>
          <th style="width:26px;">N°</th>
          <th>${audience.personLabel}</th>
          <th>Área / cargo</th>
          <th style="width:8%;">Turno</th>
          <th style="width:9%;">Días esp.</th>
          <th style="width:9%;">Días lab.</th>
          <th style="width:12%;">Horas laboradas</th>
          <th style="width:10%;">Horas extra</th>
          <th style="width:9%;">Cumplim.</th>
          <th style="width:10%;">Tarde. cobrable</th>
          <th style="width:10%;">Tarde. justificada</th>
          <th style="width:10%;">Falta just.</th>
          <th style="width:10%;">Falta sin just.</th>
        </tr></thead>
        <tbody>
          ${payrollRows.map((r, i) => `
            <tr>
              <td class="zero-cell">${i + 1}</td>
              <td class="name-cell">${r.name}</td>
              <td class="grade-cell">${r.area}</td>
              <td>${getShiftLabel(r.shift)}</td>
              <td>${r.expectedDays}</td>
              <td>${r.workedDays}</td>
              <td class="abs-cell">${r.workedTime}</td>
              <td class="${r.extraMinutes > 0 ? 'abs-cell' : 'zero-cell'}">${r.extraTime}</td>
              <td class="${r.compliancePct == null ? 'zero-cell' : ''}">${r.compliancePct == null ? '—' : `${r.compliancePct}%`}</td>
              <td>${formatLate(r.lateCharged)}</td>
              <td class="${r.lateExcused > 0 ? '' : 'zero-cell'}">${formatLate(r.lateExcused)}</td>
              <td class="${r.absentJustified > 0 ? '' : 'zero-cell'}">${r.absentJustified}</td>
              <td class="${r.absentUnjustified > 0 ? 'abs-cell' : 'zero-cell'}">${r.absentUnjustified}</td>
            </tr>`).join('') || `<tr><td colspan="13" class="zero-cell">Sin datos para los filtros seleccionados.</td></tr>`}
        </tbody>
        <tfoot><tr>
          <td></td>
          <td class="name-cell" style="text-align:right;">TOTALES</td>
          <td class="grade-cell">${payrollRows.length} ${audience.personLabel.toLowerCase()}(s)</td>
          <td></td>
          <td>${payrollFoot.expectedDays}</td>
          <td>${payrollFoot.workedDays}</td>
          <td>${formatLate(payrollFoot.workedMins)}</td>
          <td>${formatLate(payrollFoot.extraMins)}</td>
          <td>${complianceAvg == null ? '—' : `${complianceAvg}%`}</td>
          <td>${formatLate(payrollFoot.lateCharged)}</td>
          <td>${formatLate(payrollFoot.lateExcused)}</td>
          <td>${payrollFoot.just}</td>
          <td>${payrollFoot.unjust}</td>
        </tr></tfoot>
      </table>`;

    // Acta por áreas: una línea por área + firma del responsable de cada una.
    const areaRows = getByArea();
    const actaHtml = areaRows.length > 0 ? `
      <div class="section-title">Acta de asistencia por áreas</div>
      <table class="list-table">
        <thead><tr>
          <th>Área / cargo</th>
          <th style="width:8%;">${audience.personLabelPlural}</th>
          <th style="width:10%;">Días lab.</th>
          <th style="width:14%;">Horas laboradas</th>
          <th style="width:11%;">Horas extra</th>
          <th style="width:11%;">Tardanzas</th>
          <th style="width:10%;">Falta just.</th>
          <th style="width:11%;">Falta sin just.</th>
          <th>${audience.personLabelPlural} del área</th>
        </tr></thead>
        <tbody>
          ${areaRows.map(g => `
            <tr>
              <td class="name-cell">${g.area}</td>
              <td>${g.people}</td>
              <td>${g.workedDays}</td>
              <td>${formatLate(g.workedMinutes)}</td>
              <td class="${g.extraMinutes > 0 ? 'abs-cell' : 'zero-cell'}">${formatLate(g.extraMinutes)}</td>
              <td>${formatLate(g.lateCharged)}</td>
              <td>${g.absentJustified}</td>
              <td class="${g.absentUnjustified > 0 ? 'abs-cell' : 'zero-cell'}">${g.absentUnjustified}</td>
              <td class="grade-cell" style="font-size:9.5px;">${g.names.join(' · ')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="lines">
        <div class="line-item" style="margin-bottom:8px;"><b>Jefaturas / coordinaciones:</b> firman responsable por área, enterados del detalle de inasistencias y tardanzas del período ${periodShort}.</div>
        ${areaRows.map(g => `
          <div class="sig-box" style="margin-top:10px;">
            <div class="sig-line"></div>
            <div><b>${g.area}</b> — ${g.people} ${audience.personLabel.toLowerCase()}(s)</div>
          </div>`).join('')}
      </div>` : '';

    // Detalle de justificaciones del período (una fila por persona+fecha).
    const docExcuses = getExcusesInRange().slice().sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.name).localeCompare(String(b.name)));
    const excusesTable = docExcuses.length > 0 ? `
      <div class="section-title">Justificaciones registradas</div>
      <table class="list-table day-table">
        <thead><tr>
          <th style="width:12%;">Fecha</th>
          <th>${audience.personLabel}</th>
          <th style="width:14%;">Área / cargo</th>
          <th style="width:12%;">Tipo</th>
          <th style="width:10%;">Documento</th>
          <th style="width:10%;">Cubre tarde.</th>
          <th>Detalle</th>
        </tr></thead>
        <tbody>
          ${docExcuses.map(x => `
            <tr>
              <td style="white-space:nowrap;">${formatAbsentDate(x.day)}</td>
              <td class="name-cell">${x.name || '—'}</td>
              <td class="grade-cell">${x.area || '—'}</td>
              <td>${x.label || x.type || '—'}</td>
              <td>${x.document || '—'}</td>
              <td class="${x.coversLate ? '' : 'zero-cell'}">${x.coversLate ? 'Sí' : '—'}</td>
              <td class="grade-cell">${x.note || '—'}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="6" style="text-align:right;">TOTAL JUSTIFICACIONES</td>
          <td class="abs-cell">${docExcuses.length}</td>
        </tr></tfoot>
      </table>` : '';

    // Bloque de firmas: por área si hay áreas configuradas, genérico si no.
    const signaturesHtml = (showPayroll && areaRows.length > 0)
      ? actaHtml
      : `<div class="signatures">
          <div class="sig-box"><div class="sig-line"></div><div>Elaborado por — Control de asistencia</div></div>
          <div class="sig-box"><div class="sig-line"></div><div>Revisado por — Dirección</div></div>
        </div>`;


    // Carátula / resumen consolidado + bloque de firmas.
    const summaryPage = `
      <div class="doc-sheet cover-page">
        <div class="doc-header">
          <div class="doc-logo">${logoHtml}</div>
          <div class="doc-title">
            <div class="doc-institution">${institution}</div>
            <div class="doc-sub">${audience.subTitle}</div>
            <div class="doc-type">RESUMEN CONSOLIDADO DE ASISTENCIA</div>
            <div class="doc-ref">N° ${docNumber} · Sistema biométrico de control de asistencia</div>
          </div>
          <div class="doc-meta">
            <b>Fecha de emisión</b>
            ${issuedOn}
            <b>Período</b>
            ${dateTitle}
          </div>
        </div>
        <div class="filters">
          ${gradeSubtitle}
          ${filterTagsHtml}
        </div>
        <div class="cover-body">
          <div class="cover-title">Resumen general del período</div>
          <div class="cover-grid">
            <div class="stat-cell"><b>${agg.users}</b><span>${audience.personLabelPlural} en el reporte</span></div>
            <div class="stat-cell"><b>${showPayroll ? agg.workedDays : agg.days}</b><span>${showPayroll ? 'Días laborados' : 'Días con asistencia'}</span></div>
            ${showPayroll ? `
            <div class="stat-cell"><b>${agg.workedDays}/${agg.expectedDays}</b><span>Días laborados / esperados</span></div>
            <div class="stat-cell"><b>${formatLate(agg.workedMins)}</b><span>Horas realmente laboradas</span></div>
            <div class="stat-cell"><b>${formatLate(agg.extraMins)}</b><span>Horas extra</span></div>
            <div class="stat-cell"><b>${complianceAvg == null ? '—' : `${complianceAvg}%`}</b><span>Cumplimiento de jornada</span></div>
            <div class="stat-cell"><b>${agg.absentJust}/${agg.absent}</b><span>Inasistencias justificadas</span></div>
            <div class="stat-cell"><b>${agg.absentUnjust}</b><span>Inasistencias sin justificar</span></div>
            <div class="stat-cell"><b>${formatLate(agg.lateCharged)}</b><span>Tardanzas cobrables</span></div>` : `
            <div class="stat-cell"><b>${agg.onTime}</b><span>A tiempo</span></div>
            <div class="stat-cell"><b>${agg.late}</b><span>Tardanzas</span></div>
            <div class="stat-cell"><b>${formatLate(agg.lateMins)}</b><span>Minutos tarde acumulados</span></div>
            <div class="stat-cell"><b>${agg.absent}</b><span>Inasistencias</span></div>
            <div class="stat-cell"><b>${agg.review}</b><span>Días a revisar</span></div>
            <div class="stat-cell"><b>${punctAvg}%</b><span>Puntualidad promedio</span></div>`}
          </div>
          ${gradeRows ? `
          <div class="section-title">Resumen por ${audience.groupLabel.toLowerCase()}</div>
          <table class="summary-table">
            <thead><tr><th>${audience.groupLabel}</th><th>${audience.personLabelPlural}</th><th>Tardanzas</th><th>Inasistencias</th><th>A revisar</th></tr></thead>
            <tbody>${gradeRows}</tbody>
          </table>` : ''}
          <div class="lines">
            <div class="line-item"><b>Reglas:</b> Tardanza = marcar después de las ${lateLimit || '—'}${saturdayLateLimit ? ` (sáb ${saturdayLateLimit})` : ''}; cada minuto suma 1. Falta = sin marcación o marcar desde ${absentAfter || '09:00'}. Solo cuentan días laborables (lun–vie).</div>
          </div>
          ${signaturesHtml}
        </div>
        <div class="footer">
          ${institution} · Generado el ${issuedOn} · Horas en hora del colegio (UTC-5)
        </div>
      </div>`;

    // Hoja por persona: cabecera formal, identificación, indicadores,
    // asistencia diaria (detallada) e inasistencias.
    const personPages = filtered.map((user, idx) => {
      const days = user.days || [];
      const pDays = days.length;
      const onTime = days.filter(d => d.status === 'on-time').length;
      const lateCount = days.filter(d => d.status === 'late').length;
      const lateMins = days.reduce((s, d) => s + (d.lateMinutes || 0), 0);
      const absentList = user.absentDays || [];
      const reviewCount = user.reviewDays || 0;
      const checkoutCount = days.filter(d => d.checkOut).length;
      const punctuality = pDays > 0 ? Math.round((onTime / pDays) * 100) : 0;

      const s = user.schedule || {};
      const schedDays = (Array.isArray(s.days) && s.days.length)
        ? s.days.slice().sort((a, b) => a - b).map(dwn => dayShortNames[dwn] || '?').join(' · ')
        : 'Lun – Vie';
      const scheduleStr = (s.lateTime || s.endTime)
        ? `${schedDays} · ent. ${s.lateTime || '—'} · sal. ${s.endTime || '—'}`
        : schedDays;
      const shiftTxt = user.shift ? getShiftLabel(user.shift) : '—';
      const areaTxt = showPayroll ? getAreaOf(user) : (user.grade || 'General');
      const scheduleFull = showPayroll ? `${scheduleStr} · turno: ${shiftTxt}` : scheduleStr;
      const userExcuses = (user.excuses || []).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)));
      const excusedDays = (user.justifiedAbsences || []);
      const unjustifiedDays = (user.unjustifiedAbsences || []);
      const excuseLine = userExcuses.length > 0
        ? userExcuses.map(x => `${formatAbsentDate(x.day)} ${x.label || x.type}${x.document ? ` (doc. ${x.document})` : ''}${x.coversLate ? ' · cubre tardanza' : ''}`).join(' · ')
        : 'Sin justificaciones registradas en el período';
      const coveredLateDays = (user.excusedLateDays || []).map(formatAbsentDate).join(' · ') || '—';

      // Columna de marcaciones detalladas (toggle "Mostrar horarios...").
      const marksHeader = filters.showTimes ? '<th style="text-align:center;">Marcaciones</th>' : '';
      const emptyColspan = 8 + (filters.showCheckout ? 1 : 0) + (filters.showTimes ? 1 : 0);

      const dayRows = days.map((d, i) => {
        const estado = d.status === 'late' ? 'Tardanza' : 'A tiempo';
        const rowCls = d.status === 'late' ? ' class="late-row"' : '';
        const reviewTxt = d.needsReview ? (d.reviewReason || 'A revisar') : '—';
        const outCell = filters.showCheckout
          ? `<td style="text-align:center;white-space:nowrap;">${d.checkOut ? formatTime(d.checkOut) : '—'}</td>`
          : '';
        const marksCell = filters.showTimes
          ? `<td style="text-align:center;font-size:9.5px;white-space:nowrap;">${formatMarks(d) || '—'}</td>`
          : '';
        return `
          <tr${rowCls}>
            <td style="text-align:center;color:#4b5563;">${i + 1}</td>
            <td style="text-align:center;white-space:nowrap;">${renderSchoolDateStr(d.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
            <td style="text-align:center;text-transform:capitalize;">${renderSchoolDateStr(d.date, { weekday: 'short' })}</td>
            <td style="text-align:center;font-weight:700;white-space:nowrap;">${formatTime(d.checkIn) || '—'}</td>
            ${outCell}
            ${marksCell}
            <td style="text-align:center;font-weight:700;">${estado}</td>
            <td style="text-align:center;font-weight:700;">${d.lateMinutes > 0 ? d.lateMinutes : '—'}</td>
            <td style="text-align:center;white-space:nowrap;">${d.hoursWorked ? `${d.hoursWorked} h` : '—'}</td>
            <td style="text-align:center;font-size:9.5px;">${reviewTxt}</td>
          </tr>
        `;
      }).join('');

      const absentLine = absentList.length > 0
        ? absentList.map(d => `${renderSchoolDateStr(d, { day: '2-digit', month: '2-digit', year: 'numeric' })} (${renderSchoolDateStr(d, { weekday: 'long' })})`).join(' · ')
        : 'Sin inasistencias en el período';

      return `
      <div class="doc-sheet person-page">
        <div class="doc-header">
          <div class="doc-logo">${logoHtml}</div>
          <div class="doc-title">
            <div class="doc-institution">${institution}</div>
            <div class="doc-sub">${audience.subTitle}</div>
            <div class="doc-type">PLANTILLA DE ASISTENCIA INDIVIDUAL</div>
            <div class="doc-ref">N° ${docNumber}-${idx + 1} · Sistema biométrico de control de asistencia</div>
          </div>
          <div class="doc-meta">
            <b>Fecha de emisión</b>
            ${issuedOn}
            <b>Período</b>
            ${dateTitle}
            <b>${audience.personLabel} / ${audience.groupLabel}</b>
            ${idx + 1} de ${filtered.length}
          </div>
        </div>
        <div class="filters">
          ${gradeSubtitle}
          ${filterTagsHtml}
        </div>
        <table class="id-table">
          <tr>
            <th style="width:22%;">Apellidos y nombres</th>
            <td class="name-cell">${user.name}</td>
            <th style="width:18%;">${audience.groupLabel}</th>
            <td>${areaTxt}</td>
          </tr>
          <tr>
            <th>Período / Rango</th>
            <td>${periodShort}</td>
            <th>Horario</th>
            <td>${scheduleFull}</td>
          </tr>
        </table>

        <div class="section-title">Resumen de indicadores</div>
        <table class="stats-table">
          ${(() => {
            const pairs = [];
            pairs.push([audience.daysLabel, `<b>${showPayroll ? (user.workedDays ?? pDays) : pDays}</b>`]);
            if (audience.showPunctuality) pairs.push(['A tiempo', `<b>${onTime}</b>`]);
            else if (showPayroll) pairs.push(['Días esperados', `<b>${user.expectedDays || 0}</b>`]);
            else if (filters.showCheckout) pairs.push(['Salidas registradas', `<b>${checkoutCount}</b>`]);
            pairs.push(['Tardanzas', `<b>${lateCount}</b>`]);
            pairs.push(['Minutos tarde', `<b>${formatLate(lateMins)}</b>`]);
            pairs.push(['Inasistencias', `<b>${absentList.length}</b>`]);
            if (showPayroll) pairs.push(['Falta just. / sin just.', `<b>${user.justifiedAbsenceCount || 0} / ${user.unjustifiedAbsenceCount || 0}</b>`]);
            else if (audience.showPunctuality && filters.showCheckout) pairs.push(['Salidas registradas', `<b>${checkoutCount}</b>`]);
            if (showPayroll) {
              pairs.push(['Horas laboradas', `<b>${user.workedTime || '0 min'}</b>`]);
              pairs.push(['Horas extra', `<b>${user.extraTime || '0 min'}</b>`]);
            }
            if (audience.showPunctuality) pairs.push(['Puntualidad', `<b>${punctuality}%</b>`]);
            else if (showPayroll) pairs.push(['Cumplimiento de jornada', `<b>${user.compliancePct == null ? '—' : `${user.compliancePct}%`}</b>`]);
            if (audience.showPunctuality) pairs.push(['Días a revisar', `<b>${reviewCount > 0 ? reviewCount : '0'}</b>`]);
            else if (showPayroll) pairs.push(['Tarde. cobrable / just.', `<b>${formatLate(user.lateMinutesCharged ?? lateMins)} / ${formatLate(user.lateMinutesExcused || 0)}</b>`]);
            const rows = [];
            for (let i = 0; i < pairs.length; i += 2) {
              const a = pairs[i];
              const b = pairs[i + 1];
              rows.push(`<tr><th>${a[0]}</th><td>${a[1]}</td>${b ? `<th>${b[0]}</th><td>${b[1]}</td>` : '<th></th><td></td>'}</tr>`);
            }
            return rows.join('');
          })()}
        </table>

        <div class="section-title">Asistencia diaria (lunes a viernes)</div>
        <table class="daily-table">
          <thead>
            <tr>
              <th style="width:30px;text-align:center;">#</th>
              <th style="width:13%;text-align:center;">Fecha</th>
              <th style="text-align:center;">Día</th>
              <th style="text-align:center;">Entrada</th>
              ${filters.showCheckout ? '<th style="text-align:center;">Salida</th>' : ''}
              ${marksHeader}
              <th style="text-align:center;">Estado</th>
              <th style="text-align:center;">Min. tarde</th>
              <th style="text-align:center;">Horas</th>
              <th style="width:17%;text-align:center;">Observación</th>
            </tr>
          </thead>
          <tbody>${dayRows || `<tr class="empty-row"><td colspan="${emptyColspan}">Sin marcaciones registradas en el período.</td></tr>`}</tbody>
        </table>

        <div class="lines">
          <div class="line-item"><b>Inasistencias:</b> ${absentLine}</div>
          <div class="line-item"><b>Justificaciones:</b> ${excuseLine}</div>
          ${excusedDays.length > 0 || unjustifiedDays.length > 0 ? `
            <div class="line-item"><b>Inasistencias justificadas:</b> ${excusedDays.length > 0 ? excusedDays.map(formatAbsentDate).join(' · ') : '—'} · <b>sin justificar:</b> ${unjustifiedDays.length > 0 ? unjustifiedDays.map(formatAbsentDate).join(' · ') : '—'}</div>
            <div class="line-item"><b>Tardanzas cubiertas:</b> ${coveredLateDays}</div>` : ''}
          <div class="line-item"><b>Reglas:</b> Tardanza = marcar después de las ${lateLimit || '—'}${saturdayLateLimit ? ` (sáb ${saturdayLateLimit})` : ''}; cada minuto suma 1. Falta = sin marcación o marcar desde ${absentAfter || '09:00'}. Solo cuentan días laborables (lun–vie).</div>
          ${lateCount > 0 ? `<div class="line-item"><b>Tardanzas:</b> ${lateCount} evento(s) · ${formatLate(lateMins)} acumulados.</div>` : ''}
          ${showPayroll ? `<div class="line-item"><b>Control de turno:</b> ${user.workedDays ?? pDays} día(s) laborado(s) de ${user.expectedDays || 0} esperado(s) · ${user.workedTime || '0 min'} laboradas · ${user.extraTime || '0 min'} extra(s) · cumplimiento ${user.compliancePct == null ? '—' : `${user.compliancePct}%`}.</div>` : ''}
          ${filters.showTimes ? `<div class="line-item"><b>Marcaciones:</b> se muestran en hora del colegio (UTC-5); las marcaciones duplicadas se agruparon como una sola.</div>` : ''}
        </div>

        <div class="footer">
          ${audience.personLabel}: ${user.name} · Página ${idx + 1} de ${filtered.length} · Generado el ${issuedOn} · Horas en hora del colegio (UTC-5)
        </div>
      </div>
    `;
    });

    // ---- Documento consolidado: una sola lista que fluye entre páginas ----
    const buildConsolidatedSheet = () => {
      const lateGroups = getLateGrouped();
      const lateByUser = {};
      lateGroups.forEach(g => { lateByUser[g.user_id] = g; });
      const absencesByDay = getAbsencesByDay();
      const mode = filters.onlyAbsent ? 'inasistencias' : (filters.onlyLate ? 'tardanzas' : 'asistencia');
      const docType = mode === 'inasistencias'
        ? 'LISTA DE INASISTENCIAS'
        : mode === 'tardanzas' ? 'LISTA DE TARDANZAS' : 'LISTA CONSOLIDADA DE ASISTENCIA';
      const docSubRef = mode === 'inasistencias'
        ? `${absencesByDay.length} día(s) con inasistencias · ${agg.absent} inasistencia(s) en total`
        : mode === 'tardanzas'
          ? `${lateGroups.length} ${audience.personLabel.toLowerCase()}(s) con tardanzas en el período`
          : `${agg.users} ${audience.personLabel.toLowerCase()}(s) · ${agg.days} día(s) con asistencia`;

      // Columnas del formato consolidado: se adaptan al filtro activo para que la
      // "lista de inasistencias" no arrastre columnas que no aplican.
      const cols = [
        { key: 'idx', label: 'N°', width: '28px' },
        { key: 'name', label: audience.personLabel, cls: 'name-cell' },
        { key: 'grade', label: audience.groupLabel, cls: 'grade-cell' }
      ];
      if (mode === 'inasistencias') {
        cols.push({ key: 'absent', label: 'Inasistencias' });
        if (showPayroll) {
          cols.push({ key: 'absentJust', label: 'Just.' });
          cols.push({ key: 'absentUnjust', label: 'Sin just.' });
        }
        cols.push({ key: 'absentDates', label: 'Fechas de inasistencia', cls: 'grade-cell' });
        cols.push({ key: 'days', label: audience.daysLabel });
        cols.push({ key: 'late', label: 'Tardanzas' });
      } else if (mode === 'tardanzas') {
        cols.push({ key: 'late', label: 'Tardanzas' });
        cols.push({ key: 'lateMins', label: 'Min. tarde' });
        if (showPayroll) cols.push({ key: 'lateExcused', label: 'Min. justificados' });
        cols.push({ key: 'lateDetail', label: 'Detalle (fecha · límite → llegada)', cls: 'grade-cell' });
      } else {
        cols.push({ key: 'days', label: audience.daysLabel });
        cols.push({ key: 'onTime', label: 'A tiempo' });
        cols.push({ key: 'late', label: 'Tardanzas' });
        cols.push({ key: 'lateMins', label: 'Min. tarde' });
        cols.push({ key: 'absent', label: 'Inasistencias' });
        if (showPayroll) {
          cols.push({ key: 'absentJust', label: 'Just.' });
          cols.push({ key: 'absentUnjust', label: 'Sin just.' });
        }
        cols.push({ key: 'absentDates', label: 'Fechas de inasistencia', cls: 'grade-cell' });
        if (audience.showPunctuality) cols.push({ key: 'punct', label: 'Puntualidad' });
      }

      const numCell = (v, extra = '') => `<td class="${extra}">${v}</td>`;
      // Índice de justificaciones por persona+día para marcar "(J)" en las listas.
      const justIndex = {};
      filtered.forEach(u => (u.excuses || []).forEach(x => { justIndex[`${u.user_id}|${x.day}`] = x.label || x.type; }));
      const cellFor = (user, key, i) => {
        const days = user.days || [];
        const pDays = days.length;
        const onTime = days.filter(d => d.status === 'on-time').length;
        const lateCount = days.filter(d => d.status === 'late').length;
        const lateMins = days.reduce((s, d) => s + (d.lateMinutes || 0), 0);
        const absentList = user.absentDays || [];
        const punct = pDays > 0 ? Math.round((onTime / pDays) * 100) : 0;
        const absentDatesShort = absentList.map(d => {
          const j = justIndex[`${user.user_id}|${d}`];
          return `${renderSchoolDateStr(d, { day: '2-digit', month: '2-digit' })}${j ? ' (J)' : ''}`;
        }).join(' · ');
        switch (key) {
          case 'idx': return numCell(i + 1, 'zero-cell');
          case 'name': return `<td class="name-cell">${user.name}</td>`;
          case 'grade': return `<td class="grade-cell">${showPayroll ? getAreaOf(user) : (user.grade || 'General')}</td>`;
          case 'days': return numCell(showPayroll ? (user.workedDays ?? pDays) : pDays, pDays === 0 ? 'zero-cell' : '');
          case 'onTime': return numCell(onTime, onTime === 0 ? 'zero-cell' : '');
          case 'late': return numCell(lateCount, lateCount > 0 ? 'abs-cell' : 'zero-cell');
          case 'lateMins': return numCell(lateMins > 0 ? formatLate(lateMins) : '—', lateMins > 0 ? 'abs-cell' : 'zero-cell');
          case 'lateExcused': return numCell(user.lateMinutesExcused > 0 ? formatLate(user.lateMinutesExcused) : '—', user.lateMinutesExcused > 0 ? '' : 'zero-cell');
          case 'absent': return numCell(absentList.length, absentList.length > 0 ? 'abs-cell' : 'zero-cell');
          case 'absentJust': return numCell(user.justifiedAbsenceCount || 0, user.justifiedAbsenceCount > 0 ? '' : 'zero-cell');
          case 'absentUnjust': return numCell(user.unjustifiedAbsenceCount || 0, user.unjustifiedAbsenceCount > 0 ? 'abs-cell' : 'zero-cell');
          case 'absentDates': return `<td class="grade-cell">${absentDatesShort || '—'}</td>`;
          case 'punct': return numCell(`${punct}%`, punct === 0 ? 'zero-cell' : '');
          case 'lateDetail': {
            const g = lateByUser[user.user_id];
            if (!g) return `<td class="grade-cell">—</td>`;
            const txt = g.events.map(e => `${e.dateShort} ${e.limit} → ${e.checkIn} (${e.mins} min)${(user.excusedLateDays || []).includes(e.date) ? ' J' : ''}`).join(' · ');
            return `<td class="grade-cell">${txt}</td>`;
          }
          default: return '<td>—</td>';
        }
      };

      const listRows = filtered.map((u, i) => `<tr>${cols.map(c => cellFor(u, c.key, i)).join('')}</tr>`).join('');

      // Totales de la tabla (solo columnas numéricas summedables).
      const sumFor = (key) => {
        if (key === 'idx') return filtered.length;
        if (key === 'days') return showPayroll ? agg.workedDays : agg.days;
        if (key === 'onTime') return agg.onTime;
        if (key === 'late') return agg.late;
        if (key === 'lateMins') return formatLate(agg.lateMins);
        if (key === 'lateExcused') return formatLate(agg.lateExcused);
        if (key === 'absent') return agg.absent;
        if (key === 'absentJust') return agg.absentJust;
        if (key === 'absentUnjust') return agg.absentUnjust;
        if (key === 'punct') return `${punctAvg}%`;
        return '';
      };
      const footCells = cols.map((c, i) => {
        if (i === 1) return `<td class="name-cell" style="text-align:right;">TOTALES</td>`;
        if (c.cls === 'name-cell' || c.cls === 'grade-cell') return '<td></td>';
        return numCell(sumFor(c.key), 'abs-cell');
      }).join('');
      const listTable = `
        <div class="section-title">${docType}</div>
        <table class="list-table">
          <thead><tr>${cols.map(c => `<th${c.width ? ` style="width:${c.width};"` : ''}>${c.label}</th>`).join('')}</tr></thead>
          <tbody>${listRows || `<tr><td class="zero-cell" colspan="${cols.length}">Sin registros para los filtros seleccionados.</td></tr>`}</tbody>
          <tfoot><tr>${footCells}</tr></tfoot>
        </table>`;

      // Inasistencias agrupadas por día: "quién no llegó" en una sola línea por fecha.
      const dayTable = absencesByDay.length > 0 ? `
        <div class="section-title">Inasistencias por fecha</div>
        <table class="list-table day-table">
          <thead><tr>
            <th style="width:15%;">Fecha</th>
            <th style="width:12%;">Día</th>
            <th style="width:8%;">N°</th>
            <th>${audience.personLabelPlural} que no llegaron</th>
          </tr></thead>
          <tbody>
            ${absencesByDay.map(g => `
              <tr>
                <td style="white-space:nowrap;">${renderSchoolDateStr(g.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                <td style="text-transform:capitalize;">${g.weekday}</td>
                <td class="count-cell">${g.count}</td>
                <td class="names-cell">${g.items.map(it => {
                  const x = filtered.find(u => u.user_id === it.user_id);
                  const j = x ? (x.excusedLateDays || []).includes(g.date) : false;
                  return `${it.name}${j ? ' (J)' : ''}`;
                }).join(' · ')}</td>
              </tr>`).join('')}
            <tr>
              <td colspan="2" style="text-align:right;">TOTAL INASISTENCIAS</td>
              <td class="count-cell">${agg.absent}</td>
              <td class="names-cell">${showPayroll ? `${agg.absentJust} justificada(s) · ${agg.absentUnjust} sin justificar · ` : ''}${absencesByDay.length} día(s) del período con al menos una inasistencia.</td>
            </tr>
          </tbody>
        </table>` : '';

      // Anexo de tardanzas: una fila por evento (fecha, límite, llegada, minutos).
      const lateEvents = lateGroups.flatMap(g => g.events.map(e => ({ ...e, name: g.name, grade: g.grade, excused: (filtered.find(u => u.user_id === g.user_id)?.excusedLateDays || []).includes(e.date) })))
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
      const lateTable = lateEvents.length > 0 ? `
        <div class="section-title">Anexo — detalle de tardanzas</div>
        <table class="list-table">
          <thead><tr>
            <th style="width:12%;">Fecha</th>
            <th style="width:10%;">Día</th>
            <th>${audience.personLabel}</th>
            <th style="width:14%;">${audience.groupLabel}</th>
            <th style="width:12%;">Hora límite</th>
            <th style="width:12%;">Hora llegada</th>
            <th style="width:12%;">Min. retraso</th>
            ${showPayroll ? '<th style="width:10%;">Justificada</th>' : ''}
          </tr></thead>
          <tbody>
            ${lateEvents.map(e => `
              <tr>
                <td style="white-space:nowrap;">${e.dateShort}</td>
                <td style="text-transform:capitalize;">${e.weekday}</td>
                <td class="name-cell">${e.name}</td>
                <td class="grade-cell">${e.grade}</td>
                <td>${e.limit}</td>
                <td class="abs-cell">${e.checkIn}</td>
                <td class="abs-cell">${e.mins}</td>
                ${showPayroll ? `<td class="${e.excused ? '' : 'zero-cell'}">${e.excused ? 'Sí' : '—'}</td>` : ''}
              </tr>`).join('')}
            <tr>
              <td colspan="${showPayroll ? 6 : 6}" style="text-align:right;">TOTAL TARDANZAS</td>
              <td class="abs-cell">${lateEvents.length}</td>
              ${showPayroll ? `<td class="zero-cell">${lateEvents.filter(e => e.excused).length}</td>` : ''}
            </tr>
          </tbody>
        </table>` : '';

      const gradeTable = (mode === 'asistencia' && gradeRows) ? `
        <div class="section-title">Resumen por ${audience.groupLabel.toLowerCase()}</div>
        <table class="summary-table">
          <thead><tr><th>${audience.groupLabel}</th><th>${audience.personLabelPlural}</th><th>Tardanzas</th><th>Inasistencias</th><th>A revisar</th></tr></thead>
          <tbody>${gradeRows}</tbody>
        </table>` : '';

      return `
      <div class="doc-flow">
        <div class="doc-header">
          <div class="doc-logo">${logoHtml}</div>
          <div class="doc-title">
            <div class="doc-institution">${institution}</div>
            <div class="doc-sub">${audience.subTitle}</div>
            <div class="doc-type">${docType}</div>
            <div class="doc-ref">N° ${docNumber} · ${docSubRef}</div>
          </div>
          <div class="doc-meta">
            <b>Fecha de emisión</b>
            ${issuedOn}
            <b>Período</b>
            ${dateTitle}
          </div>
        </div>
        <div class="filters">
          ${gradeSubtitle}
          ${filterTagsHtml}
        </div>
        <div class="cover-body">
          <div class="cover-grid">
            <div class="stat-cell"><b>${agg.users}</b><span>${audience.personLabelPlural} en el reporte</span></div>
            ${showPayroll ? `
            <div class="stat-cell"><b>${agg.workedDays}/${agg.expectedDays}</b><span>Días laborados / esperados</span></div>
            <div class="stat-cell"><b>${formatLate(agg.workedMins)}</b><span>Horas realmente laboradas</span></div>
            <div class="stat-cell"><b>${formatLate(agg.extraMins)}</b><span>Horas extra</span></div>
            <div class="stat-cell"><b>${complianceAvg == null ? '—' : `${complianceAvg}%`}</b><span>Cumplimiento de jornada</span></div>
            <div class="stat-cell"><b>${agg.absentJust}/${agg.absent}</b><span>Inasistencias justificadas</span></div>
            <div class="stat-cell"><b>${agg.absentUnjust}</b><span>Inasistencias sin justificar</span></div>
            <div class="stat-cell"><b>${agg.late}</b><span>Tardanzas</span></div>
            <div class="stat-cell"><b>${formatLate(agg.lateCharged)}</b><span>Tardanzas cobrables</span></div>` : `
            <div class="stat-cell"><b>${agg.days}</b><span>Días con asistencia</span></div>
            <div class="stat-cell"><b>${agg.onTime}</b><span>A tiempo</span></div>
            <div class="stat-cell"><b>${agg.late}</b><span>Tardanzas</span></div>
            <div class="stat-cell"><b>${formatLate(agg.lateMins)}</b><span>Minutos tarde acumulados</span></div>
            <div class="stat-cell"><b>${agg.absent}</b><span>Inasistencias</span></div>
            <div class="stat-cell"><b>${agg.review}</b><span>Días a revisar</span></div>
            <div class="stat-cell"><b>${punctAvg}%</b><span>Puntualidad promedio</span></div>`}
          </div>
          ${listTable}
          ${dayTable}
          ${lateTable}
          ${gradeTable}
          ${showPayroll ? payrollTable : ''}
          ${showPayroll ? excusesTable : ''}
          <div class="lines">
            <div class="line-item"><b>Reglas:</b> Tardanza = marcar después de las ${lateLimit || '—'}${saturdayLateLimit ? ` (sáb ${saturdayLateLimit})` : ''}; cada minuto suma 1. Falta = sin marcación o marcar desde ${absentAfter || '09:00'}. Solo cuentan días laborables (lun–vie).</div>
            ${showPayroll ? '<div class="line-item"><b>(J)</b> marca una fecha con justificación registrada (licencia, permiso, comisión, vacaciones, remoto, onisión, capacitación u otro); el detalle está en la tabla de justificaciones.</div>' : ''}
            ${filters.showTimes ? '<div class="line-item"><b>Marcaciones:</b> las duplicadas se agruparon como una sola marca.</div>' : ''}
          </div>
          ${signaturesHtml}
        </div>
        <div class="footer">
          ${institution} · ${docType} · Período ${periodShort} · Generado el ${issuedOn} · Horas en hora del colegio (UTC-5)
        </div>
      </div>`;
    };

    if (docConfig.pdfFormat === 'consolidado') {
      const consolidatedPage = buildConsolidatedSheet();
      return {
        summaryPage: consolidatedPage,
        personPages: [],
        allSheets: filtered.length > 0 ? [consolidatedPage] : [],
        docNumber,
        institution
      };
    }

    return {
      summaryPage,
      personPages,
      allSheets: [summaryPage, ...personPages],
      docNumber,
      institution
    };
  };

  const handlePrint = () => {
    const win = window.open('', 'report-print-window', 'width=1200,height=800');
    if (!win) {
      setError('No se pudo abrir la ventana de impresión. Verifica que los popups estén habilitados.');
      return;
    }
    const { allSheets } = buildDocument();
    const docBody = allSheets.length > 0
      ? allSheets.join('')
      : '<div class="empty-doc">No hay datos para los filtros seleccionados.</div>';

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Asistencia - ${getGradesLabel(filters.grades)}</title>
        <style>${DOC_CSS}</style>
      </head>
      <body>
        ${docBody}
        <script>window.print();setTimeout(() => window.close(), 600);</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const exportCsv = () => {
    setExporting('csv');
    try {
      const filtered = getFilteredReport();
      const header = ['N°', 'Apellidos y nombres', audience.groupLabel];
      if (showPayroll) header.push('Turno', 'Días esperados', 'Días laborados', 'Horas laboradas', 'Horas extra', 'Cumplimiento %');
      header.push('Días', 'A tiempo', 'Tardanzas', 'Min. tarde', 'Inasistencias');
      if (showPayroll) header.push('Falta justificada', 'Falta sin justificar', 'Tarde. cobrable (min)', 'Tarde. justificada (min)');
      header.push('Fechas inasistencia', 'Salidas');
      if (audience.showPunctuality) header.push('Puntualidad %');
      header.push('Días a revisar');
      const rows = filtered.map((u, i) => {
        const pDays = (u.days || []).length;
        const onTime = (u.days || []).filter(d => d.status === 'on-time').length;
        const rate = pDays > 0 ? Math.round((onTime / pDays) * 100) : 0;
        const row = [i + 1, u.name, showPayroll ? getAreaOf(u) : (u.grade || 'General')];
        if (showPayroll) row.push(getShiftLabel(u.shift), u.expectedDays || 0, u.workedDays ?? pDays, u.workedTime || '0 min', u.extraTime || '0 min', u.compliancePct == null ? '' : u.compliancePct);
        row.push(pDays, onTime, u.lateDays || 0, (u.days || []).reduce((s, d) => s + (d.lateMinutes || 0), 0), (u.absentDays || []).length);
        if (showPayroll) row.push(u.justifiedAbsenceCount || 0, u.unjustifiedAbsenceCount || 0, u.lateMinutesCharged ?? 0, u.lateMinutesExcused || 0);
        row.push((u.absentDays || []).join(', '), (u.days || []).filter(d => d.checkOut).length);
        if (audience.showPunctuality) row.push(`${rate}%`);
        row.push(u.reviewDays || 0);
        return row;
      });
      const csv = '\ufeff' + [header, ...rows]
        .map(r => r.map(v => v == null ? '' : String(v).replace(/"/g, '""')).map(v => `"${v}"`).join(';'))
        .join('\r\n');
      downloadBlob(csv, 'reporte-asistencia.csv', 'text/csv;charset=utf-8;');
    } catch (e) {
      setError(`Error al exportar CSV: ${e.message || e}`);
    } finally {
      setExporting(null);
    }
  };

  const exportExcel = async () => {
    setExporting('xlsx');
    try {
      const { buildAttendanceWorkbook, XLSX_MIME, XLSX_FILE } = await import('./lib/excelReport');
      // El Excel es la única salida que cuenta los sábados además de L–V.
      const opts = { saturdays: true };
      const content = await buildAttendanceWorkbook({
        users: getFilteredReport(opts),
        showPayroll,
        groupLabel: audience.groupLabel,
        showPunctuality: audience.showPunctuality,
        filters,
        payRows: getPayrollRows(opts),
        payTotals: getPayrollTotals(opts),
        byArea: getByArea(opts),
        excuses: getExcusesInRange(),
        shiftLabel: getShiftLabel
      });
      downloadBlob(content, XLSX_FILE, XLSX_MIME);
    } catch (e) {
      setError(`Error al exportar Excel: ${e.message || e}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Reporte de Asistencia</h1>
          <p className="text-sm text-slate-400 mt-1">Genera, imprime y exporta reportes segmentados por grado o nivel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all duration-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir ({docConfig.pdfFormat === 'consolidado' ? 'consolidado' : 'detallado'})
          </button>
          <button onClick={exportExcel} disabled={exporting !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {exporting === 'xlsx' ? 'Generando Excel...' : 'Excel (.xlsx)'}
          </button>
          <button onClick={exportCsv} disabled={exporting !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 13 7 15 9 17"/><polyline points="15 13 17 15 15 17"/></svg>
            CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-700">Filtros del reporte</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Desde</label>
            <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} max={filters.to}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hasta</label>
            <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} min={filters.from}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Grados / Áreas <span className="text-orange-500 normal-case">(selección múltiple)</span>
            </label>
            <div className="flex flex-wrap gap-2 p-3 bg-orange-50/50 border border-orange-200 rounded-xl max-h-32 overflow-auto">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-pointer border bg-white text-slate-600 border-slate-200 hover:border-orange-300">
                <input type="checkbox"
                  checked={filters.grades.length === 0}
                  onChange={() => setFilters(p => ({ ...p, grades: [] }))}
                  className="w-3.5 h-3.5 accent-orange-500" />
                Todos
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-pointer border bg-white text-slate-600 border-slate-200 hover:border-orange-300">
                <input type="checkbox"
                  checked={filters.grades.includes('secundaria_alta')}
                  onChange={() => toggleGradeSel('secundaria_alta')}
                  className="w-3.5 h-3.5 accent-orange-500" />
                ⭐ 3°, 4° y 5° Sec.
              </label>
              {(grades.length > 0 ? grades : ['3° Secundaria - A','3° Secundaria - B','4° Secundaria - A','4° Secundaria - B','5° Secundaria','Docentes / Personal','General']).map(g => (
                <label key={g} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-pointer border transition-colors ${filters.grades.includes(g) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'}`}>
                  <input type="checkbox" checked={filters.grades.includes(g)} onChange={() => toggleGradeSel(g)}
                    className="w-3.5 h-3.5 accent-white" />
                  {g}
                </label>
              ))}
            </div>
            {filters.grades.length > 0 && (
              <p className="text-[11px] text-slate-400">Seleccionados: <strong className="text-slate-600">{getGradesLabel(filters.grades)}</strong> <button onClick={() => setFilters(p => ({ ...p, grades: [] }))} className="text-orange-600 font-semibold hover:underline ml-1">Limpiar</button></p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</label>
            <select value={filters.studentCategory} onChange={e => setFilters(p => ({ ...p, studentCategory: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
              <option value="all">Todos los estudiantes</option>
              <option value="general">Solo General</option>
              <option value="no-general">Grado específico</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 justify-end">
            <button onClick={fetchReport} disabled={loading}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Generando...' : 'Generar reporte'}
            </button>
          </div>
        </div>

        {/* Second row: Additional filters */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-200">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Persona específica</label>
            <select value={filters.userId} onChange={e => setFilters(p => ({ ...p, userId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
              <option value="">Todas</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.grade || 'General'})</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={filters.onlyLate} onChange={e => setFilters(p => ({ ...p, onlyLate: e.target.checked }))}
                className="w-4 h-4 accent-red-500 cursor-pointer" />
              <span className="text-sm font-semibold text-slate-600">Solo tardanzas</span>
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={filters.onlyAbsent} onChange={e => setFilters(p => ({ ...p, onlyAbsent: e.target.checked }))}
                className="w-4 h-4 accent-blue-500 cursor-pointer" />
              <span className="text-sm font-semibold text-slate-600">Solo inasistencias</span>
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={filters.onlyUnjustified} onChange={e => setFilters(p => ({ ...p, onlyUnjustified: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600 cursor-pointer" />
              <span className="text-sm font-semibold text-slate-600">Solo sin justificar</span>
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={filters.onlyReview} onChange={e => setFilters(p => ({ ...p, onlyReview: e.target.checked }))}
                className="w-4 h-4 accent-red-500 cursor-pointer" />
              <span className="text-sm font-semibold text-red-600">Solo a revisar</span>
            </label>
          </div>
        </div>
      </div>

      {/* Justificaciones (licencias, permisos, comisiones) — RR.HH. */}
      <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 mb-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 5-3.5 7.5-8.5 9-5-1.5-8.5-4-8.5-9V5.5L12 3l7.5 2.5z"/></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-700">Justificaciones del período</h3>
          <span className="text-[11px] text-slate-400">Licencias, permisos, comisiones, vacaciones, remoto, onisión, capacitación u otro</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setExcuseOpen(v => !v)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] transition-all">
              {excuseOpen ? 'Cancelar' : '+ Registrar justificación'}
            </button>
          </div>
        </div>

        {excuseOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 mb-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Persona</label>
              <select value={excuseForm.userId} onChange={e => setExcuseForm(f => ({ ...f, userId: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400">
                <option value="">Seleccionar…</option>
                {(report || []).map(u => <option key={u.user_id} value={u.user_id}>{u.name} ({getAreaOf(u)})</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Fecha</label>
              <input type="date" min={filters.from} max={filters.to} value={excuseForm.date} onChange={e => setExcuseForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tipo</label>
              <select value={excuseForm.type} onChange={e => setExcuseForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400">
                {(excuseTypes.length > 0 ? excuseTypes : [{ value: 'licencia', label: 'Licencia' }]).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Documento (opcional)</label>
              <input type="text" maxLength={80} value={excuseForm.document} placeholder="Ej. RES-2026-014" onChange={e => setExcuseForm(f => ({ ...f, document: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Detalle (opcional)</label>
              <input type="text" maxLength={300} value={excuseForm.note} placeholder="Ej. Comisión en la dirección" onChange={e => setExcuseForm(f => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400" />
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={excuseForm.coversLate} onChange={e => setExcuseForm(f => ({ ...f, coversLate: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                También exonera la tardanza de ese día
              </label>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <input type="password" value={adminPass} placeholder="Contraseña de administrador" onChange={e => setAdminPass(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400 w-44" />
              <button onClick={() => { sessionStorage.setItem('zk_admin', '1'); sessionStorage.setItem('zk_admin_pass', adminPass); saveExcuse(); }}
                disabled={savingExcuse || !adminPass}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.97] transition-all">
                {savingExcuse ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {getExcusesInRange().length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Persona</th>
                  <th className="py-2 pr-3">Área / cargo</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Cubre tarde.</th>
                  <th className="py-2 pr-3">Detalle</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getExcusesInRange().map(x => (
                  <tr key={`${x.userId}-${x.day}`} className="text-slate-600">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatAbsentDate(x.day)}</td>
                    <td className="py-2 pr-3 font-semibold text-slate-700">{x.name || '—'}</td>
                    <td className="py-2 pr-3">{x.area || '—'}</td>
                    <td className="py-2 pr-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">{x.label || x.type}</span></td>
                    <td className="py-2 pr-3">{x.document || '—'}</td>
                    <td className="py-2 pr-3">{x.coversLate ? 'Sí' : '—'}</td>
                    <td className="py-2 pr-3 text-slate-400">{x.note || '—'}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => deleteExcuse(x.userId, x.day)} title="Eliminar justificación"
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition-all">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-6">Sin justificaciones registradas entre ${formatAbsentDate(filters.from)} y ${formatAbsentDate(filters.to)}.</p>
        )}
      </div>

      {/* Customization */}
      <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-700">Personalización / Marca del documento</h3>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200 mb-4">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Formato del documento (PDF / impresión)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {[
              { id: 'consolidado', title: 'Consolidado — una sola lista', desc: 'Todo en un solo documento: lista por persona, inasistencias por fecha y anexo de tardanzas. Con el filtro "Solo inasistencias" sale únicamente la lista de quién no llegó.' },
              { id: 'detallado', title: 'Detallado — página por persona', desc: 'Carátula con el resumen del período y una hoja completa por persona con su asistencia diaria.' }
            ].map(opt => (
              <label key={opt.id} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${docConfig.pdfFormat === opt.id ? 'border-purple-400 bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-200'}`}>
                <input type="radio" name="pdf-format" value={opt.id} checked={docConfig.pdfFormat === opt.id}
                  onChange={() => setDocConfig(p => ({ ...p, pdfFormat: opt.id }))}
                  className="w-4 h-4 mt-0.5 accent-purple-600 cursor-pointer" />
                <div>
                  <div className="text-sm font-semibold text-slate-700">{opt.title}</div>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Logo de la institución</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0">
                <img id="report-logo" className="w-full h-full object-contain" />
              </div>
              <label className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors">
                Seleccionar imagen
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => { document.getElementById('report-logo').src = ev.target.result; };
                    reader.readAsDataURL(file);
                  }
                }} />
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre de la institución</label>
            <input type="text" value={docConfig.institution} placeholder="Ej. Colegio Galileo" onChange={e => setDocConfig(p => ({ ...p, institution: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
            <p className="text-[11px] text-slate-400">Se muestra en el encabezado de cada hoja y de la carátula.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subtítulo</label>
            <input type="text" value={docConfig.subTitle} placeholder="Ej. Educación Básica Regular" onChange={e => setDocConfig(p => ({ ...p, subTitle: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
            <p className="text-[11px] text-slate-400">Debajo del nombre de la institución.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Prefijo N° de documento</label>
            <input type="text" value={docConfig.docPrefix} maxLength={8} onChange={e => setDocConfig(p => ({ ...p, docPrefix: e.target.value.replace(/[^A-Za-z0-9-]/g, '') }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
            <p className="text-[11px] text-slate-400">Referencia actual: <strong>{`${docConfig.docPrefix || 'REP'}-${filters.from.replace(/-/g, '')}-${filters.to.replace(/-/g, '')}`}</strong></p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Etiqueta persona (singular)</label>
            <input type="text" value={docConfig.personLabel} placeholder={`Auto: "${audience.personLabel}"`} onChange={e => setDocConfig(p => ({ ...p, personLabel: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Etiqueta persona (plural)</label>
            <input type="text" value={docConfig.personLabelPlural} placeholder={`Auto: "${audience.personLabelPlural}"`} onChange={e => setDocConfig(p => ({ ...p, personLabelPlural: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Etiqueta de grupo</label>
            <input type="text" value={docConfig.groupLabel} placeholder={`Auto: "${audience.groupLabel}"`} onChange={e => setDocConfig(p => ({ ...p, groupLabel: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-500/10" />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={filters.showTimes} onChange={e => setFilters(p => ({ ...p, showTimes: e.target.checked }))}
              className="w-4 h-4 accent-orange-500 cursor-pointer" />
            <div>
              <span className="text-sm font-semibold text-slate-700">Mostrar marcaciones detalladas</span>
              <p className="text-xs text-slate-400">Incluye la columna "Marcaciones" con cada toque del día al imprimir o exportar</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={filters.showCheckout} onChange={e => setFilters(p => ({ ...p, showCheckout: e.target.checked }))}
              className="w-4 h-4 accent-orange-500 cursor-pointer" />
            <div>
              <span className="text-sm font-semibold text-slate-700">Mostrar hora de salida</span>
              <p className="text-xs text-slate-400">Incluye la columna de salida de cada día al imprimir el reporte</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={filters.showLateMinutes} onChange={e => setFilters(p => ({ ...p, showLateMinutes: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 cursor-pointer" />
            <div>
              <span className="text-sm font-semibold text-slate-700">Mostrar minutos tardados (acumulado)</span>
              <p className="text-xs text-slate-400">Suma SOLO los minutos que tardó al ingresar (desde el límite{lateLimit ? ` ${lateLimit}` : ''}{saturdayLateLimit ? `; sábados ${saturdayLateLimit}` : ''}). Si marca desde las {absentAfter || '09:00'}{saturdayAbsentAfter && saturdayAbsentAfter !== (absentAfter || '09:00') ? ` (sáb ${saturdayAbsentAfter})` : ''} se cuenta como falta, no como minutos tarde</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={filters.showPayroll} onChange={e => setFilters(p => ({ ...p, showPayroll: e.target.checked }))}
              className="w-4 h-4 accent-emerald-600 cursor-pointer" />
            <div>
              <span className="text-sm font-semibold text-slate-700">Mostrar resumen de planilla (RR.HH.){isPersonnel ? '' : ' — solo para personal'}</span>
              <p className="text-xs text-slate-400">Días laborados/esperados, horas realmente laboradas, horas extra, cumplimiento, tardanzas cobrables e inasistencias justificadas vs. sin justificar; incluye el acta con firmas por área</p>
            </div>
          </label>
        </div>
      </div>

      {/* Preview */}
      {loading || initialLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
            <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-slate-400">Generando reporte...</p>
        </div>
      ) : report && report.length > 0 ? (
        <>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>Solo se contabilizan días laborables (lunes a viernes; la exportación a Excel incluye los sábados).</span>
            <span className="text-slate-300">·</span>
            <span>Tardanza: marcar después del límite{lateLimit ? ` (${lateLimit})` : ''}. Falta: sin marca o marcar desde {absentAfter || '09:00'}.</span>
          </div>
          {reportTotals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-100 border-b border-slate-100">
              {showPayroll ? (
                <>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-slate-800">{reportTotals.workedDays ?? 0}/{reportTotals.expectedDays ?? 0}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Días laborados / esperados</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-slate-800">{reportTotals.workedTime || formatLate(reportTotals.workedMinutes || 0)}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Horas laboradas</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-emerald-600">{reportTotals.extraTime || formatLate(reportTotals.extraMinutes || 0)}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Horas extra</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-slate-800">{reportTotals.compliancePct == null ? '—' : `${reportTotals.compliancePct}%`}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cumplimiento de jornada</div>
                  </div>
                  <div className="bg-white px-5 py-3" title="Inasistencias con justificación registrada (no se descuentan)">
                    <div className="text-lg font-bold text-emerald-600">{reportTotals.justifiedAbsences ?? 0}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Faltas justificadas</div>
                  </div>
                  <div className="bg-white px-5 py-3" title="Inasistencias sin justificación (se descuentan)">
                    <div className="text-lg font-bold text-red-600">{reportTotals.unjustifiedAbsences ?? reportTotals.totalAbsences}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Faltas sin justificar</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-slate-800">{reportTotals.users}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Personas en el período</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-red-600">{reportTotals.lateDays}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tardanzas (días)</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-amber-600">{formatLate(reportTotals.totalLateMinutes)}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Minutos tarde</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-blue-600">{reportTotals.totalAbsences}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Inasistencias</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-red-600">{reportTotals.toReview}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Días a revisar</div>
                  </div>
                  <div className="bg-white px-5 py-3">
                    <div className="text-lg font-bold text-slate-800">{reportTotals.lateMinutesFormatted || formatLate(reportTotals.totalLateMinutes)}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total min. acumulados</div>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full" ref={printRef}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-10">
                    <input
                      type="checkbox"
                      checked={(() => {
                        const visible = getFilteredReport().filter(u => filters.selectedUsers[u.user_id] !== false);
                        return visible.length === getFilteredReport().length && visible.length > 0;
                      })()}
                      ref={el => { if (el) el.indeterminate = (() => {
                        const visible = getFilteredReport().filter(u => filters.selectedUsers[u.user_id] !== false);
                        return visible.length > 0 && visible.length < getFilteredReport().length;
                      })(); }}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFilters(p => {
                          const next = { ...p.selectedUsers };
                          getFilteredReport().forEach(u => { next[u.user_id] = checked; });
                          return { ...p, selectedUsers: next };
                        });
                      }}
                      className="w-4 h-4 accent-orange-500 cursor-pointer"
                      title="Seleccionar / deseleccionar todos"
                    />
                  </th>
                  {[
                    audience.personLabel,
                    audience.groupLabel,
                    audience.daysLabel,
                    'A tiempo',
                    'Tardanzas',
                    ...(filters.showLateMinutes ? ['Min. tarde (acum.)'] : []),
                    'Inasistencias',
                    'Fechas inasistencia',
                    audience.checkoutLabel,
                    ...(audience.showPunctuality ? ['Puntualidad'] : []),
                    'Revisar'
                  ].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getFilteredReport().map(user => {
                  const total = user.days.length;
                  const onTime = user.days.filter(d => d.status === 'on-time').length;
                  const late = user.days.filter(d => d.status === 'late').length;
                  const absent = (user.absentDays || []).length;
                  const lateMins = user.days.reduce((s, d) => s + (d.lateMinutes || 0), 0);
                  const rate = total > 0 ? Math.round((onTime / total) * 100) : 0;
                  return (
                    <tr key={user.user_id} className={`border-b border-slate-100 last:border-0 transition-colors ${filters.selectedUsers[user.user_id] === false ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={filters.selectedUsers[user.user_id] !== false}
                          onChange={e => setFilters(p => ({ ...p, selectedUsers: { ...p.selectedUsers, [user.user_id]: e.target.checked } }))}
                          className="w-4 h-4 accent-orange-500 cursor-pointer"
                          title={filters.selectedUsers[user.user_id] === false ? 'Incluir en el reporte' : 'Excluir del reporte'}
                        />
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700">{user.name}</td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">
                          {showPayroll ? getAreaOf(user) : (user.grade || 'General')}
                        </span>
                        {(user.shift || (user.schedule && (user.schedule.days?.length || user.schedule.lateTime || user.schedule.endTime))) && (
                          <div className="mt-1">
                            <span title="Horario personal" className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200/60">
                              {showPayroll ? `Turno: ${getShiftLabel(user.shift)} · ` : 'Horario: '}{(user.schedule?.days || []).map(d => ['D','L','M','X','J','V','S'][d] ?? '?').join('·')}{user.schedule?.lateTime ? ` · ent ${user.schedule.lateTime}` : ''}{user.schedule?.endTime ? ` · sal ${user.schedule.endTime}` : ''}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{total}</td>
                      <td className="px-5 py-4 text-sm font-medium text-emerald-600">{onTime}</td>
                      <td className="px-5 py-4 text-sm font-medium text-red-600">{late}</td>
                      {filters.showLateMinutes && (
                        <td className="px-5 py-4">
                          <span title="Solo días con marcación. Las faltas no suman minutos."
                            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${lateMins > 0 ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                            ⏱ {formatLate(lateMins)}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-4 text-sm font-medium text-blue-600" title="Las faltas no suman minutos tardados">{absent}</td>
                      <td className="px-5 py-4">
                        {(user.absentDays || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(user.absentDays || []).map(d => (
                              <span key={d} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                                {formatAbsentDate(d)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{user.days.filter(d => d.checkOut).length}</td>
                      {audience.showPunctuality && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${rate >= 80 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }}></div>
                            </div>
                            <span className="text-xs font-bold text-slate-600">{rate}%</span>
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-4">
                        {(user.reviewDays || 0) > 0 ? (
                          <span title="Días con doble marcación o más de 4 marcas. Revísalas en Asistencias → modo admin → editar por día."
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200/60">
                            ⚠ {user.reviewDays}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filters.showLateMinutes && getFilteredReport().length > 0 && (
            <div className="px-6 py-4 bg-amber-50/60 border-t border-amber-100 flex items-center gap-2 text-xs font-semibold text-amber-800">
              <span>⏱</span>
              <span>
                Total minutos tardados acumulados (desde el límite{lateLimit ? ` ${lateLimit}` : ''}{saturdayLateLimit ? ` · sáb ${saturdayLateLimit}` : ''}): {formatLate(getFilteredReport().reduce((s, u) => s + u.days.reduce((a, d) => a + (d.lateMinutes || 0), 0), 0))}
                <span className="font-normal text-amber-700/80"> · solo lo que tardó al ingresar; marcar desde las {absentAfter || '09:00'}{saturdayAbsentAfter && saturdayAbsentAfter !== (absentAfter || '09:00') ? ` (sáb ${saturdayAbsentAfter})` : ''} = falta (no suma minutos)</span>
              </span>
            </div>
          )}
          {getFilteredReport().reduce((s, u) => s + (u.reviewDays || 0), 0) > 0 && (
            <div className="px-6 py-4 bg-red-50/70 border-t border-red-100 flex items-center gap-2 text-xs font-semibold text-red-800">
              <span>⚠</span>
              <span>
                {getFilteredReport().reduce((s, u) => s + (u.reviewDays || 0), 0)} día(s) con doble marcación o más de 4 marcas.
                <span className="font-normal text-red-700/80"> Se auto-corrigieron al agruparlas; si ves un caso dudoso, corrígelo en Asistencias → modo admin → editar por día.</span>
              </span>
            </div>
          )}
        </div>

        {/* Planilla / control de turno del personal */}
        {showPayroll && getFilteredReport().length > 0 && (() => {
          const rows = getPayrollRows();
          const foot = getPayrollTotals();
          const head = ['N°', audience.personLabel, 'Área / cargo', 'Turno', 'Días esp.', 'Días lab.', 'Horas laboradas', 'Horas extra', 'Cumplim.', 'Tarde. cobrable', 'Tarde. just.', 'Falta just.', 'Falta sin just.'];
          return (
            <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700">Resumen de planilla / control de turno</h3>
                  <p className="text-xs text-slate-400">Horas realmente laboradas (permanencia entre la primera y última marca), horas extra sobre la jornada esperada y cumplimiento</p>
                </div>
                <span className="ml-auto text-xs font-semibold text-slate-500">{rows.length} {audience.personLabel.toLowerCase()}(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      {head.map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.user_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60 inline-block whitespace-nowrap">{r.area}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{getShiftLabel(r.shift)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{r.expectedDays}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">{r.workedDays}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.workedTime}</td>
                        <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${r.extraMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{r.extraTime}</td>
                        <td className="px-4 py-3">
                          {r.compliancePct == null ? <span className="text-sm text-slate-300">—</span> : (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${r.compliancePct >= 90 ? 'bg-emerald-500' : r.compliancePct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, r.compliancePct)}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-slate-600">{r.compliancePct}%</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-amber-700 whitespace-nowrap">{formatLate(r.lateCharged)}</td>
                        <td className="px-4 py-3 text-sm text-emerald-700 whitespace-nowrap">{r.lateExcused > 0 ? formatLate(r.lateExcused) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-emerald-700">{r.absentJustified || '—'}</td>
                        <td className={`px-4 py-3 text-sm font-semibold ${r.absentUnjustified > 0 ? 'text-red-600' : 'text-slate-300'}`}>{r.absentUnjustified || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold">
                      <td></td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">TOTALES</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{foot.people} persona(s)</td>
                      <td></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{foot.expectedDays}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{foot.workedDays}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{formatLate(foot.workedMinutes)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{formatLate(foot.extraMinutes)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{reportTotals?.compliancePct == null ? '—' : `${reportTotals.compliancePct}%`}</td>
                      <td className="px-4 py-3 text-sm text-amber-700">{formatLate(foot.lateCharged)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{formatLate(foot.lateExcused)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{foot.absentJustified}</td>
                      <td className="px-4 py-3 text-sm text-red-600">{foot.absentUnjustified}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Acta por áreas con firma del responsable */}
        {showPayroll && getByArea().length > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Acta de asistencia por áreas</h3>
                <p className="text-xs text-slate-400">Imprime, firma cada responsable de área y archiva con el reporte</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    {['Área / cargo', audience.personLabelPlural, 'Días lab.', 'Horas laboradas', 'Horas extra', 'Tarde. cobrable', 'Falta just.', 'Falta sin just.', 'Integrantes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getByArea().map(g => (
                    <tr key={g.area} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{g.area}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{g.people}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{g.workedDays}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatLate(g.workedMinutes)}</td>
                      <td className={`px-4 py-3 text-sm whitespace-nowrap ${g.extraMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{formatLate(g.extraMinutes)}</td>
                      <td className="px-4 py-3 text-sm text-amber-700 whitespace-nowrap">{formatLate(g.lateCharged)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{g.absentJustified}</td>
                      <td className={`px-4 py-3 text-sm ${g.absentUnjustified > 0 ? 'font-semibold text-red-600' : 'text-slate-300'}`}>{g.absentUnjustified}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{g.names.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-slate-100">
              {getByArea().map(g => (
                <div key={`sig-${g.area}`}>
                  <div className="h-8 border-b border-slate-300"></div>
                  <p className="text-[11px] text-slate-500 mt-1">Responsable de {g.area}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {getLateGrouped().length > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Detalle de tardanzas — fecha y hora de llegada</h3>
                <p className="text-xs text-slate-400">Una fila por persona con cada tardanza: fecha, hora límite, hora real de ingreso y minutos de retraso</p>
              </div>
              <span className="ml-auto text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                {getLateGrouped().reduce((s, g) => s + g.count, 0)} tardanza(s) en {getLateGrouped().length} {audience.personLabel.toLowerCase()}(s)
              </span>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    {['N°', audience.personLabel, audience.groupLabel, 'Detalle de tardanzas por día'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getLateGrouped().map((g, i) => (
                    <tr key={g.user_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 align-top">
                      <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="text-sm font-semibold text-slate-700">{g.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{g.count} tardanza(s) · {formatLate(g.totalMins)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">{g.grade}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                          <table className="w-full">
                            <thead className="bg-slate-50">
                              <tr>
                                {['Fecha', 'Día', 'Hora límite', 'Hora de llegada', 'Min. retraso'].map(h => (
                                  <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center border-b border-slate-200">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {g.events.map((e, j) => (
                                <tr key={j} className="border-t border-slate-100">
                                  <td className="px-3 py-2 text-xs text-slate-600 text-center whitespace-nowrap">{e.dateShort}</td>
                                  <td className="px-3 py-2 text-xs text-slate-500 text-center">{e.weekday}</td>
                                  <td className="px-3 py-2 text-xs text-slate-400 text-center">{e.limit}</td>
                                  <td className="px-3 py-2 text-xs font-bold text-slate-800 text-center">{e.checkIn}</td>
                                  <td className="px-3 py-2 text-xs font-bold text-slate-700 text-center">{e.mins}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-slate-200 bg-slate-100">
                                <td colSpan={4} className="px-3 py-2 text-[11px] font-bold text-slate-500 text-right">Total por persona</td>
                                <td className="px-3 py-2 text-xs font-bold text-slate-700 text-center">{g.totalMins} min</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      ) : report !== null ? (
        <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <h3 className="text-base font-semibold text-slate-600">Sin registros</h3>
          <p className="text-sm">No hay registros de asistencia para este período y/o filtro.</p>
        </div>
      ) : null}
    </div>
  );
}
