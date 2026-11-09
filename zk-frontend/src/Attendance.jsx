import { useState, useEffect } from 'react';
import { formatSchoolTime, formatSchoolDate, loadSchoolOffset } from './lib/schoolTime';

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

export default function Attendance({ setError }) {
  const [data, setData] = useState([]);
  const [users, setUsers] = useState({});
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [selectedGrades, setSelectedGrades] = useState([]); // [] = todos
  const [showGradeMenu, setShowGradeMenu] = useState(false);

  const filters = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: '7 días' },
    { key: 'all', label: 'Todo' },
  ];

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
    </div>
  );
}
