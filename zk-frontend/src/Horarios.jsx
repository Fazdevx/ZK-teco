import { useState, useEffect } from 'react';
import { loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

// Días de la semana (valor = getUTCDay: 0=Domingo .. 6=Sábado). Orden de la semana escolar.
const DAYS = [
  { v: 1, label: 'L' },
  { v: 2, label: 'M' },
  { v: 3, label: 'X' },
  { v: 4, label: 'J' },
  { v: 5, label: 'V' },
  { v: 6, label: 'S' },
  { v: 0, label: 'D' }
];

const SHIFTS = [
  { v: '', label: 'Sin turno' },
  { v: 'manana', label: 'Turno mañana' },
  { v: 'tarde', label: 'Turno tarde' },
  { v: 'noche', label: 'Turno noche' }
];

const shiftLabel = (v) => (SHIFTS.find(s => s.v === v)?.label) || 'Sin turno';

const EMPTY_ROW = { days: [], lateTime: '', endTime: '', offDates: [], area: '', shift: '' };

const DayChips = ({ row, onToggle, small = false }) => (
  <div className="flex items-center gap-1">
    {DAYS.map(d => (
      <button key={d.v}
        onClick={() => onToggle(d.v)}
        className={`${small ? 'w-7 h-7 text-[11px]' : 'w-8 h-8 text-xs'} rounded-lg font-bold transition-all active:scale-95 ${
          row.days.includes(d.v)
            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm shadow-orange-500/25'
            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
        }`}>
        {d.label}
      </button>
    ))}
  </div>
);

export default function Horarios({ setError, setSuccess }) {
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState({}); // userId -> row editable
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({}); // userId -> bool
  const [bulk, setBulk] = useState({ days: [], lateTime: '', endTime: '', area: '', shift: '' });
  const [applying, setApplying] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const loadAll = async () => {
    const [uRes, sRes] = await Promise.all([
      fetch(`${API}/data/users`).then(r => r.json()),
      fetch(`${API}/data/schedules`).then(r => r.json())
    ]);
    if (uRes.success) {
      const scheduleMap = sRes.success ? (sRes.data || {}) : {};
      const init = {};
      uRes.data.forEach(u => {
        const s = scheduleMap[u.id];
        init[u.id] = s
          ? { days: s.days || [], lateTime: s.lateTime || '', endTime: s.endTime || '', offDates: s.offDates || [], area: s.area || '', shift: s.shift || '' }
          : { ...EMPTY_ROW };
      });
      setUsers(uRes.data);
      setRows(init);
    }
  };

  useEffect(() => {
    loadSchoolOffset(API);
    (async () => {
      try {
        await loadAll();
      } catch { setError('Error al cargar horarios'); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      await loadAll();
    } catch { setError('Error al cargar horarios'); }
    finally { setLoading(false); }
  };

  const userType = (u) => {
    const g = (u.grade || '').trim();
    if (g === 'Docentes / Personal') return 'docentes';
    if (g === 'General' || g === '') return 'general';
    return 'alumnos';
  };

  const filteredUsers = users.filter(u => {
    if (typeFilter !== 'todos' && userType(u) !== typeFilter) return false;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || String(u.id).includes(q);
  });

  const TYPE_FILTERS = [
    { v: 'todos', label: 'Todos' },
    { v: 'docentes', label: 'Docentes' },
    { v: 'alumnos', label: 'Alumnos' },
    { v: 'general', label: 'General' }
  ];

  const patch = (id, fn) => setRows(p => ({ ...p, [id]: fn(p[id] || { ...EMPTY_ROW }) }));

  const toggleDay = (id, v) => patch(id, r => ({
    ...r,
    days: r.days.includes(v) ? r.days.filter(x => x !== v) : [...r.days, v]
  }));

  const setTime = (id, key, value) => patch(id, r => ({ ...r, [key]: value }));

  const addOffDate = (id) => patch(id, r => ({
    ...r,
    offDates: [...new Set([...(r.offDates || []), r.newOffDate].filter(Boolean))],
    newOffDate: ''
  }));
  const setNewOffDate = (id, value) => patch(id, r => ({ ...r, newOffDate: value }));
  const removeOffDate = (id, d) => patch(id, r => ({ ...r, offDates: (r.offDates || []).filter(x => x !== d) }));

  const saveRow = async (id) => {
    const r = rows[id] || { ...EMPTY_ROW };
    setSavingId(id);
    try {
      const res = await (await fetch(`${API}/data/users/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: r.days,
          lateTime: r.lateTime || null,
          endTime: r.endTime || null,
          offDates: r.offDates || [],
          area: (r.area || '').trim() || null,
          shift: r.shift || null
        })
      })).json();
      if (!res.success) throw new Error(res.message);
      setSuccess('Horario guardado');
    } catch (e) { setError(e.message); }
    finally { setSavingId(null); }
  };

  const clearRow = async (id) => {
    setSavingId(id);
    try {
      const res = await (await fetch(`${API}/data/users/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true })
      })).json();
      if (!res.success) throw new Error(res.message);
      setRows(p => ({ ...p, [id]: { ...EMPTY_ROW } }));
      setSuccess('Horario eliminado (regla general)');
    } catch (e) { setError(e.message); }
    finally { setSavingId(null); }
  };

  const toggleDayBulk = (v) => setBulk(p => ({
    ...p,
    days: p.days.includes(v) ? p.days.filter(x => x !== v) : [...p.days, v]
  }));

  const applyBulk = async (clear = false) => {
    const ids = Object.keys(selected).filter(id => selected[id]).map(Number);
    if (ids.length === 0) { setError('Selecciona al menos un usuario'); return; }
    setApplying(true);
    try {
      const body = clear
        ? { userIds: ids, clear: true }
        : { userIds: ids, days: bulk.days, lateTime: bulk.lateTime || null, endTime: bulk.endTime || null, area: (bulk.area || '').trim() || null, shift: bulk.shift || null };
      const res = await (await fetch(`${API}/data/schedules/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })).json();
      if (!res.success) throw new Error(res.message);
      setSuccess(`${ids.length} horarios actualizados`);
      await loadAll();
    } catch (e) { setError(e.message); }
    finally { setApplying(false); }
  };

  const scheduleSummary = (r) => {
    const labels = DAYS.filter(d => (r.days || []).includes(d.v)).map(d => d.label).join('·') || 'Sin días';
    return labels;
  };

  const hasSchedule = (r) => !!(r && ((r.days && r.days.length > 0) || r.lateTime || r.endTime || r.area || r.shift || (r.offDates && r.offDates.length > 0)));

  const selectedCount = Object.keys(selected).filter(id => selected[id]).length;

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Horarios personales</h1>
          <p className="text-sm text-slate-400 mt-1">Define qué días asiste cada persona, su hora de entrada/saida, área o cargo y turno. Sin horario = regla general (lunes a viernes). El área y el turno se usan en el reporte de personal (planilla y acta por áreas).</p>
        </div>
        <button onClick={reload}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all duration-200 active:scale-[0.97]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9"/></svg>
          Recargar
        </button>
      </div>

      {/* Bulk apply panel */}
      <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-700">Aplicar a seleccionados</h3>
              <p className="text-xs text-slate-400">{selectedCount > 0 ? `${selectedCount} usuario(s) seleccionado(s)` : 'Marca filas para aplicar el mismo horario'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Días</span>
            <DayChips row={bulk} onToggle={toggleDayBulk} small />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Entrada límite</label>
            <input type="time" value={bulk.lateTime} onChange={e => setBulk(p => ({ ...p, lateTime: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2">Salida</label>
            <input type="time" value={bulk.endTime} onChange={e => setBulk(p => ({ ...p, endTime: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Área / cargo</label>
            <input type="text" list="schedule-areas" value={bulk.area} placeholder="Ej. Matemática" onChange={e => setBulk(p => ({ ...p, area: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
            <datalist id="schedule-areas">
              {[...new Set(Object.values(rows).map(r => (r.area || '').trim()).filter(Boolean))].map(a => <option key={a} value={a} />)}
            </datalist>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2">Turno</label>
            <select value={bulk.shift} onChange={e => setBulk(p => ({ ...p, shift: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
              {SHIFTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => applyBulk(false)} disabled={applying}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
              {applying ? 'Aplicando...' : 'Aplicar horario'}
            </button>
            <button onClick={() => applyBulk(true)} disabled={applying}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed">
              Quitar horario
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Dejar "Entrada límite", "Salida", "Área / cargo" o "Turno" vacíos al aplicar a seleccionados borra ese dato de las filas seleccionadas. Las fechas "No laborables" se editan por fila.</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ID..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 transition-all" />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {TYPE_FILTERS.map(t => (
              <button key={t.v} onClick={() => setTypeFilter(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  typeFilter === t.v
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-500">{users.filter(u => !hasSchedule(rows[u.id])).length} sin horario</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
              <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-600">Sin resultados</h3>
            <p className="text-sm">No se encontraron usuarios con ese filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3.5 w-10">
                    <input type="checkbox"
                      checked={filteredUsers.length > 0 && filteredUsers.every(u => selected[u.id])}
                      onChange={e => {
                        const checked = e.target.checked;
                        setSelected(p => {
                          const next = { ...p };
                          filteredUsers.forEach(u => { next[u.id] = checked; });
                          return next;
                        });
                      }}
                      className="w-4 h-4 accent-orange-500 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Días de asistencia</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Entrada límite</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Salida</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Área / cargo</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Turno</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">No laborables</th>
                  <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const r = rows[u.id] || { ...EMPTY_ROW };
                  const has = hasSchedule(r);
                  return (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors align-top">
                      <td className="px-4 py-3.5 text-center">
                        <input type="checkbox" checked={!!selected[u.id]}
                          onChange={e => setSelected(p => ({ ...p, [u.id]: e.target.checked }))}
                          className="w-4 h-4 accent-orange-500 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-[160px]">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${has ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
                            {(u.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-700 truncate">{u.name}</div>
                            <div className="text-[11px] text-slate-400">
                              <span className="font-mono">#{u.id}</span> · {u.grade || 'General'}
                              {!has && <span className="ml-1.5 text-slate-300">· regla general (L-V)</span>}
                            </div>
                            {has && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200/60">
                                  {scheduleSummary(r)}
                                  {r.lateTime && <span className="font-medium">· ent {r.lateTime}</span>}
                                  {r.endTime && <span className="font-medium">· sal {r.endTime}</span>}
                                </span>
                                {r.shift && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                    {shiftLabel(r.shift)}
                                  </span>
                                )}
                                {r.area && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    {r.area}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <DayChips row={r} onToggle={(v) => toggleDay(u.id, v)} />
                      </td>
                      <td className="px-4 py-3.5">
                        <input type="time" value={r.lateTime || ''} onChange={e => setTime(u.id, 'lateTime', e.target.value)}
                          title="Hora límite de entrada (vacío = config global)"
                          className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                      </td>
                      <td className="px-4 py-3.5">
                        <input type="time" value={r.endTime || ''} onChange={e => setTime(u.id, 'endTime', e.target.value)}
                          title="Hora de salida (vacío = config global)"
                          className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                      </td>
                      <td className="px-4 py-3.5">
                        <input type="text" list="schedule-areas" maxLength={60} value={r.area || ''} placeholder="Ej. Matemática" onChange={e => setTime(u.id, 'area', e.target.value)}
                          title="Área o cargo (se usa en el reporte de personal y el acta por áreas)"
                          className="px-2.5 py-2 w-40 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                      </td>
                      <td className="px-4 py-3.5">
                        <select value={r.shift || ''} onChange={e => setTime(u.id, 'shift', e.target.value)}
                          title="Turno del personal (vacío = sin turno)"
                          className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                          {SHIFTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          <div className="flex flex-wrap gap-1">
                            {(r.offDates || []).map(d => (
                              <span key={d} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                                {d}
                                <button onClick={() => removeOffDate(u.id, d)} className="text-blue-400 hover:text-red-500 font-bold">&times;</button>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <input type="date" value={r.newOffDate || ''} onChange={e => setNewOffDate(u.id, e.target.value)}
                              className="flex-1 px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-400" />
                            <button onClick={() => addOffDate(u.id)} disabled={!r.newOffDate}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold disabled:opacity-40 disabled:cursor-not-allowed">+</button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 justify-center">
                          <button onClick={() => saveRow(u.id)} disabled={savingId === u.id}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-sm active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                            {savingId === u.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          {has && (
                            <button onClick={() => clearRow(u.id)} disabled={savingId === u.id}
                              title="Quitar horario (vuelve a regla general)"
                              className="w-8 h-8 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors disabled:opacity-50">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}