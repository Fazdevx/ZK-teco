import { useState, useEffect } from 'react';
import { toSchool, formatSchoolTime, formatSchoolDate, formatSchoolDateTime, schoolDayKey, renderSchoolDateStr, loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

const PUNCH_META = {
  entry:     { label: 'Entrada',               className: 'bg-blue-50 text-blue-700 border-blue-200/50',     dot: 'bg-blue-500' },
  lunch_out: { label: 'Salida a refrigerio',   className: 'bg-amber-50 text-amber-700 border-amber-200/50', dot: 'bg-amber-500' },
  lunch_in:  { label: 'Regreso de refrigerio', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/50', dot: 'bg-emerald-500' },
  exit:      { label: 'Salida final',          className: 'bg-purple-50 text-purple-700 border-purple-200/50', dot: 'bg-purple-500' }
};

function PunchBadge({ label }) {
  const meta = PUNCH_META[label] || PUNCH_META.entry;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${meta.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
      {meta.label}
    </span>
  );
}

const GRADE_COLORS = {
  '3° Secundaria - A': 'bg-amber-50 text-amber-700 border-amber-200/60',
  '3° Secundaria - B': 'bg-yellow-50 text-yellow-700 border-yellow-200/60',
  '4° Secundaria - A': 'bg-orange-50 text-orange-700 border-orange-200/60',
  '4° Secundaria - B': 'bg-red-50 text-red-700 border-red-200/60',
  '5° Secundaria': 'bg-rose-50 text-rose-700 border-rose-200/60',
  'Docentes / Personal': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'General': 'bg-slate-50 text-slate-600 border-slate-200/60'
};

function DayEditorList({ dayLoading, dayLogs, dayTimeEdits, setDayTimeEdits, toTimeStr, daySavingId, saveDayTime, removeLog, dayEditor, newTime, setNewTime, addDayTime, addingTime, punchLabels }) {
  return (
    <div className="px-6 py-4 max-h-[55vh] overflow-auto">
      {dayLoading ? (
        <div className="flex items-center justify-center py-10 gap-3 text-slate-400 text-sm">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-orange-500 animate-spin"></div>
          Cargando marcaciones del día...
        </div>
      ) : dayLogs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm font-semibold text-slate-600">Sin marcaciones este día</p>
          <p className="text-xs text-slate-400 mt-1">Agrega la primera hora abajo (ej. entrada 07:30).</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayLogs.map((log, idx) => {
            const current = dayTimeEdits[log.id] ?? toTimeStr(log.check_time);
            const changed = current !== toTimeStr(log.check_time);
            return (
              <div key={log.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${changed ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-700">{punchLabels[log.punch_label] || log.punch_label}</span>
                  {log.isDuplicate && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200/60 rounded-full px-2 py-0.5 w-fit">⚠ duplicada</span>
                  )}
                  <span className="text-[11px] text-slate-400">Registrado: {toTimeStr(log.check_time)}{log.status === 'late' && log.lateMinutes ? ` • tarde +${log.lateMinutes} min` : log.status === 'late' ? ' • tarde' : log.status === 'absent' ? ' • inasistencia (marcó muy tarde)' : ' • a tiempo'}</span>
                </div>
                <input type="time" value={current}
                  onChange={e => setDayTimeEdits(p => ({ ...p, [log.id]: e.target.value }))}
                  className="ml-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-semibold outline-none focus:border-orange-400" />
                <button onClick={() => saveDayTime(log)} disabled={!changed || daySavingId === log.id}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 disabled:opacity-40 shrink-0">
                  {daySavingId === log.id ? '...' : 'Guardar'}
                </button>
                <button onClick={() => removeLog({ ...log, user_name: dayEditor.userName })}
                  title="Eliminar esta marcación"
                  className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-100 flex items-center justify-center hover:bg-red-100 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Agregar marcación este día</p>
        <div className="flex items-center gap-2">
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-semibold outline-none focus:border-orange-400" />
          <button onClick={addDayTime} disabled={addingTime || !newTime}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 disabled:opacity-50 shrink-0">
            {addingTime ? 'Agregando...' : '+ Agregar'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">La 1ª marca del día define si llega tarde (límite + tolerancia de Ajustes).</p>
      </div>
    </div>
  );
}

export default function Attendance({ setError, setSuccess }) {
  const [data, setData] = useState([]);
  const [users, setUsers] = useState({});
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [selectedGrades, setSelectedGrades] = useState([]); // [] = todos
  const [showGradeMenu, setShowGradeMenu] = useState(false);

  // ── Admin (editar asistencias) ──
  const [isAdmin, setIsAdmin] = useState(() => !!sessionStorage.getItem('zk_admin'));
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [adminChecking, setAdminChecking] = useState(false);
  // Editor por día: persona + fecha -> lista de marcaciones del día
  const [dayEditor, setDayEditor] = useState(null); // { userId, userName, grade, date }
  const [dayLogs, setDayLogs] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayTimeEdits, setDayTimeEdits] = useState({}); // { logId: 'HH:MM' }
  const [daySavingId, setDaySavingId] = useState(null);
  const [newTime, setNewTime] = useState('');
  const [addingTime, setAddingTime] = useState(false);

  const PUNCH_LABELS = { entry: 'Entrada', lunch_out: 'Salida a refrigerio', lunch_in: 'Regreso de refrigerio', exit: 'Salida final' };

  const toTimeStr = (iso) => {
    const d = toSchool(iso);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };

  const fmtDateLong = (yyyyMmDd) => {
    try {
      return renderSchoolDateStr(yyyyMmDd, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return yyyyMmDd; }
  };

  const buildParams = () => {
    const params = new URLSearchParams({ filter });
    if (selectedGrades.length > 0) params.set('grade', selectedGrades.join(','));
    return params;
  };

  const loadData = () => {
    setLoading(true);
    fetch(`${API}/data/attendance?${buildParams()}`)
      .then(r => r.json())
      .then(r => { if (r.success) setData(r.data); else setError(r.message); })
      .catch(() => setError('Error al cargar asistencias'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchoolOffset(API);
    fetch(`${API}/data/users`)
      .then(r => r.json())
      .then(r => { if (r.success) { const m = {}; r.data.forEach(u => m[u.id] = u.name); setUsers(m); } })
      .catch(() => {});
    fetch(`${API}/data/grades`)
      .then(r => r.json())
      .then(r => { if (r.success) setGrades(r.data.grades || []); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarga al cambiar filtros
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, selectedGrades]);

  const toggleGrade = (g) => {
    setSelectedGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const gradeLabel = selectedGrades.length === 0
    ? 'Todos los grados'
    : selectedGrades.length === 1
      ? selectedGrades[0]
      : `${selectedGrades.length} seleccionados`;

  // ── Admin: verificar contraseña ──
  const adminHeaders = () => ({
    'Content-Type': 'application/json',
    'x-admin-password': sessionStorage.getItem('zk_admin_pass') || ''
  });

  // Guardamos la clave en memoria de sesión para reenviarla en PUT/DELETE.
  // (Se guarda solo si el verify fue exitoso.)
  const verifyAdminWithStore = async (e) => {
    e?.preventDefault();
    if (!adminPass) return;
    setAdminChecking(true);
    try {
      const r = await (await fetch(`${API}/admin/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPass })
      })).json();
      if (!r.success) throw new Error(r.message || 'Contraseña incorrecta');
      sessionStorage.setItem('zk_admin', '1');
      sessionStorage.setItem('zk_admin_pass', adminPass);
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminPass('');
      setSuccess?.('Modo administrador activado');
    } catch (err) { setError(err.message); }
    finally { setAdminChecking(false); }
  };

  const openEdit = (log) => {
    // Editor por día: parte de la fecha de la marcación y carga TODAS
    // las marcaciones de esa persona en ese día para editarlas por hora.
    // La fecha del día se toma en la zona del colegio, no en la local de la PC.
    const dateStr = schoolDayKey(log.check_time);
    openDayEditor({
      userId: log.user_id,
      userName: log.user_name || users[log.user_id] || `#${log.user_id}`,
      grade: log.grade || 'General',
      date: dateStr
    });
  };

  const openDayEditor = async (info) => {
    setDayEditor(info);
    setDayLogs([]);
    setDayTimeEdits({});
    setNewTime('');
    setDayLoading(true);
    try {
      const r = await (await fetch(`${API}/data/attendance/day?userId=${info.userId}&date=${info.date}`)).json();
      if (!r.success) throw new Error(r.message);
      const logs = r.data.logs || [];
      setDayLogs(logs);
      const edits = {};
      logs.forEach(l => { edits[l.id] = toTimeStr(l.check_time); });
      setDayTimeEdits(edits);
      // Sugerir próxima hora para agregar (última + 1 min o 07:30 si vacío)
      if (logs.length > 0) {
        const last = toSchool(logs[logs.length - 1].check_time);
        last.setUTCMinutes(last.getUTCMinutes() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        setNewTime(`${pad(last.getUTCHours())}:${pad(last.getUTCMinutes())}`);
      } else {
        setNewTime('07:30');
      }
    } catch (err) { setError(err.message); }
    finally { setDayLoading(false); }
  };

  const reloadDay = async () => {
    if (!dayEditor) return;
    setDayLoading(true);
    try {
      const r = await (await fetch(`${API}/data/attendance/day?userId=${dayEditor.userId}&date=${dayEditor.date}`)).json();
      if (!r.success) throw new Error(r.message);
      const logs = r.data.logs || [];
      setDayLogs(logs);
      const edits = {};
      logs.forEach(l => { edits[l.id] = toTimeStr(l.check_time); });
      setDayTimeEdits(edits);
    } catch (err) { setError(err.message); }
    finally { setDayLoading(false); }
  };

  const saveDayTime = async (log) => {
    const hhmm = dayTimeEdits[log.id];
    if (!hhmm || !dayEditor) return;
    setDaySavingId(log.id);
    try {
      const r = await (await fetch(`${API}/data/attendance/${log.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ check_time: `${dayEditor.date}T${hhmm}` })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess?.(`Hora actualizada a ${hhmm}`);
      await reloadDay();
      loadData();
    } catch (err) { setError(err.message); }
    finally { setDaySavingId(null); }
  };

  const addDayTime = async () => {
    if (!newTime || !dayEditor) return;
    setAddingTime(true);
    try {
      const r = await (await fetch(`${API}/data/attendance`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ userId: dayEditor.userId, check_time: `${dayEditor.date}T${newTime}` })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess?.(`Marcación ${newTime} agregada`);
      setNewTime('');
      await reloadDay();
      loadData();
    } catch (err) { setError(err.message); }
    finally { setAddingTime(false); }
  };

  const removeLog = async (log) => {
    if (!confirm(`¿Eliminar la marcación de ${log.user_name || users[log.user_id]} (${formatSchoolDateTime(log.check_time)})?`)) return;
    try {
      const r = await (await fetch(`${API}/data/attendance/${log.id}`, {
        method: 'DELETE',
        headers: adminHeaders()
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess?.('Registro eliminado');
      if (dayEditor) await reloadDay();
      loadData();
    } catch (err) { setError(err.message); }
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem('zk_admin');
    sessionStorage.removeItem('zk_admin_pass');
    setIsAdmin(false);
    setDayEditor(null);
    setDayLogs([]);
  };

  const filters = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: '7 días' },
    { key: 'all', label: 'Todo' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Registro de Asistencia</h1>
          <p className="text-sm text-slate-400 mt-1">{data.length} registros encontrados</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Grade multi-filter */}
          <div className="relative">
            <button
              onClick={() => setShowGradeMenu(v => !v)}
              className="px-3.5 py-2 bg-white rounded-xl text-xs font-semibold text-slate-700 border border-slate-200 shadow-sm outline-none hover:border-orange-300 transition-colors">
              {gradeLabel} ▾
            </button>
            {showGradeMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowGradeMenu(false)}></div>
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-slate-200 shadow-xl p-2 z-20 max-h-72 overflow-auto">
                  <button
                    onClick={() => { setSelectedGrades([]); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 text-slate-600">
                    ✓ Todos los grados {selectedGrades.length === 0 ? '(activo)' : ''}
                  </button>
                  <div className="my-1 border-t border-slate-100"></div>
                  {grades.length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-400">Sin grados registrados</p>
                  )}
                  {grades.map(g => (
                    <label key={g} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedGrades.includes(g)} onChange={() => toggleGrade(g)}
                        className="w-4 h-4 accent-orange-500" />
                      <span className="truncate">{g}</span>
                    </label>
                  ))}
                  {selectedGrades.length > 0 && (
                    <button onClick={() => { setSelectedGrades([]); setShowGradeMenu(false); }}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100">
                      Limpiar selección
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {selectedGrades.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap max-w-md">
              {selectedGrades.map(g => (
                <span key={g} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200/60">
                  {g}
                  <button onClick={() => toggleGrade(g)} className="hover:text-orange-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Admin button */}
          {!isAdmin ? (
            <button onClick={() => setShowAdminModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm hover:border-orange-300 hover:text-orange-600 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Admin
            </button>
          ) : (
            <button onClick={logoutAdmin} title="Salir del modo administrador"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 shadow-sm hover:bg-emerald-100 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Admin ✓ (salir)
            </button>
          )}

          {/* Time range filter */}
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200">
            {filters.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  filter === f.key
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/20'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
              <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
            </div>
            <p className="text-sm font-medium text-slate-400">Cargando...</p>
          </div>
        ) : data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  {['Usuario', 'Grado / Área', 'Fecha', 'Hora', 'Tipo', 'Estado'].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                  ))}
                  {isAdmin && (
                    <th className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((log, idx) => {
                  const date = new Date(log.check_time);
                  return (
                    <tr key={log.id || idx}
                      className={`border-b border-slate-100 last:border-0 transition-colors duration-100 ${
                        log.punch_type === 'entry'
                          ? log.status === 'late' ? 'bg-amber-50/40' : log.status === 'absent' ? 'bg-red-50/40' : 'hover:bg-slate-50'
                          : 'hover:bg-slate-50'
                      }`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                            {(log.user_name || users[log.user_id] || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{log.user_name || users[log.user_id] || `#${log.user_id}`}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${GRADE_COLORS[log.grade] || GRADE_COLORS['General']}`}>
                          {log.grade || 'General'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-slate-500">{formatSchoolDate(date)}</td>
                      <td className="px-5 py-4 text-sm font-mono text-slate-500">{formatSchoolTime(date)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <PunchBadge label={log.punch_label || (log.punch_type === 'entry' ? 'entry' : 'exit')} />
                          {log.isDuplicate && (
                            <span title="Segunda huella en el lector (auto-agrupada con la anterior)" className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200/60">⚠ dup</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {log.punch_type === 'entry' && log.punch_label !== 'lunch_in' ? (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                            log.status === 'late'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                              : log.status === 'absent'
                                ? 'bg-red-50 text-red-600 border border-red-200/50'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'late' ? 'bg-amber-500' : log.status === 'absent' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                            {log.status === 'late' ? `Tarde${log.lateMinutes ? ` +${log.lateMinutes}m` : ''}` : log.status === 'absent' ? 'Inasistencia' : 'A tiempo'}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(log)} title="Editar fecha/hora"
                              className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center hover:bg-blue-100 transition-colors">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            </button>
                            <button onClick={() => removeLog(log)} title="Eliminar marcación"
                              className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-100 flex items-center justify-center hover:bg-red-100 transition-colors">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-600">Sin registros</h3>
            <p className="text-sm">No hay registros de asistencia para este período.</p>
          </div>
        )}
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={verifyAdminWithStore} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Acceso administrador</h2>
                <p className="text-xs text-slate-400">Contraseña para editar asistencias</p>
              </div>
            </div>
            <input type="password" autoFocus value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              placeholder="Contraseña de administrador"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
            <div className="flex items-center gap-3 mt-4">
              <button type="button" onClick={() => { setShowAdminModal(false); setAdminPass(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancelar</button>
              <button type="submit" disabled={adminChecking || !adminPass}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 disabled:opacity-50">
                {adminChecking ? 'Verificando...' : 'Ingresar'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center">Por defecto: admin123 (cámbiala en Ajustes)</p>
          </form>
        </div>
      )}

      {dayEditor && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold leading-tight">{dayEditor.userName}</h2>
                  <p className="text-xs text-white/80">{dayEditor.grade} • ID {dayEditor.userId}</p>
                </div>
                <button onClick={() => setDayEditor(null)}
                  className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-lg leading-none">×</button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white/80 uppercase">Fecha</span>
                <input type="date" value={dayEditor.date}
                  onChange={e => { if (e.target.value) openDayEditor({ ...dayEditor, date: e.target.value }); }}
                  className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white outline-none" />
                <span className="text-xs text-white/90 capitalize">{fmtDateLong(dayEditor.date)}</span>
              </div>
            </div>
            <DayEditorList
              dayLoading={dayLoading}
              dayLogs={dayLogs}
              dayTimeEdits={dayTimeEdits}
              setDayTimeEdits={setDayTimeEdits}
              toTimeStr={toTimeStr}
              daySavingId={daySavingId}
              saveDayTime={saveDayTime}
              removeLog={removeLog}
              dayEditor={dayEditor}
              newTime={newTime}
              setNewTime={setNewTime}
              addDayTime={addDayTime}
              addingTime={addingTime}
              punchLabels={PUNCH_LABELS}
            />
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
              <button onClick={() => setDayEditor(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">Cerrar</button>
              <button onClick={() => { setDayEditor(null); loadData(); }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600">
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}