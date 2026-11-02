import { useState, useEffect } from 'react';
import { formatSchoolTime, renderSchoolDateStr, loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

const GRADES = [
  '3° Secundaria - A',
  '3° Secundaria - B',
  '4° Secundaria - A',
  '4° Secundaria - B',
  '5° Secundaria',
  'Docentes / Personal',
  'General'
];

const GRADE_COLORS = {
  '3° Secundaria - A': 'bg-amber-50 text-amber-700 border-amber-200/60',
  '3° Secundaria - B': 'bg-yellow-50 text-yellow-700 border-yellow-200/60',
  '4° Secundaria - A': 'bg-orange-50 text-orange-700 border-orange-200/60',
  '4° Secundaria - B': 'bg-red-50 text-red-700 border-red-200/60',
  '5° Secundaria': 'bg-rose-50 text-rose-700 border-rose-200/60',
  'Docentes / Personal': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'General': 'bg-slate-50 text-slate-600 border-slate-200/60'
};

export default function Users({ setError, setSuccess }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ userId: '', name: '', grade: '3° Secundaria - A' });
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [fingerGuidanceUser, setFingerGuidanceUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = async (id) => {
    setSelected(id); setLoadingDetail(true); setDetail(null);
    try {
      const r = await (await fetch(`${API}/data/users/${id}/detail`)).json();
      if (r.success) setDetail(r.data);
    } catch { setError('Error al cargar detalle'); }
    finally { setLoadingDetail(false); }
  };

  const loadUsers = (selectIdAfter = null) => {
    fetch(`${API}/data/users`)
      .then(r => r.json())
      .then(r => {
        if (r.success) {
          setUsers(r.data);
          if (selectIdAfter) loadDetail(selectIdAfter);
        }
      })
      .catch(() => setError('Error al cargar usuarios'));
  };

  useEffect(() => { loadSchoolOffset(API); loadUsers(); }, []);

  const createUser = async () => {
    if (!newUser.userId || !newUser.name) return;
    setCreating(true);
    const createdId = parseInt(newUser.userId);
    const createdName = newUser.name;
    const createdGrade = newUser.grade || 'General';
    try {
      const r = await (await fetch(`${API}/device/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: createdId, name: createdName, grade: createdGrade })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess('Usuario creado en el lector y en la base de datos');
      setShowCreate(false);
      setNewUser({ userId: '', name: '', grade: '3° Secundaria - A' });
      loadUsers(createdId);
      setFingerGuidanceUser({ id: createdId, name: createdName });
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const saveEditUser = async () => {
    if (!editUser || !editUser.name) return;
    setEditing(true);
    try {
      const r = await (await fetch(`${API}/device/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editUser.name, grade: editUser.grade })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess('Usuario actualizado con éxito');
      setEditUser(null);
      loadUsers(selected);
      if (selected === editUser.id) {
        loadDetail(editUser.id);
      }
    } catch (e) { setError(e.message); }
    finally { setEditing(false); }
  };

  const deleteUser = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const r = await (await fetch(`${API}/device/users/${deleteConfirm}`, { method: 'DELETE' })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess('Usuario eliminado');
      setDeleteConfirm(null);
      setDetail(null);
      setSelected(null);
      loadUsers();
    } catch (e) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(u.id).includes(search);
    if (!matchesSearch) return false;
    if (selectedGrade === 'all') return true;
    if (selectedGrade === 'secundaria_alta') {
      return ['3° Secundaria - A', '3° Secundaria - B', '4° Secundaria - A', '4° Secundaria - B', '5° Secundaria'].includes(u.grade);
    }
    return u.grade === selectedGrade;
  });

  // Historial combinado: días con marcación + días sin marcar (inasistencias).
  const historyDays = detail ? [
    ...(detail.days || []).map(d => ({ ...d, isAbsent: false })),
    ...(detail.absentDays || []).map(date => ({
      date, checkIn: null, checkOut: null, lunchOut: null, lunchIn: null,
      totalChecks: 0, status: 'absent', lateMinutes: 0, hoursWorked: null, isAbsent: true
    }))
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Usuarios y Grados</h1>
          <p className="text-sm text-slate-400 mt-1">{users.length} usuarios registrados en el sistema</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all duration-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo usuario
        </button>
      </div>

      {/* Grade filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        <button
          onClick={() => setSelectedGrade('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
            selectedGrade === 'all'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}>
          Todos ({users.length})
        </button>
        <button
          onClick={() => setSelectedGrade('secundaria_alta')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
            selectedGrade === 'secundaria_alta'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
          }`}>
          ⭐ 3°, 4° y 5° Sec. ({users.filter(u => ['3° Secundaria - A', '3° Secundaria - B', '4° Secundaria - A', '4° Secundaria - B', '5° Secundaria'].includes(u.grade)).length})
        </button>
        {GRADES.map(g => {
          const count = users.filter(u => u.grade === g).length;
          return (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedGrade === g
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              {g} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 min-h-[600px]">
        {/* User list */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-y-auto max-h-[650px]">
          <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o ID..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 transition-all"
              />
            </div>
          </div>
          {filteredUsers.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">
              No se encontraron usuarios
            </div>
          )}
          {filteredUsers.map(u => (
            <div key={u.id} onClick={() => loadDetail(u.id)}
              className={`flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0 cursor-pointer transition-all duration-150 ${
                selected === u.id ? 'bg-gradient-to-r from-orange-50 to-orange-50/50 border-l-2 border-l-orange-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm transition-all ${
                selected === u.id ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/20' : 'bg-gradient-to-br from-slate-400 to-slate-500'
              }`}>
                {(u.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold text-slate-700 truncate">{u.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">ID: #{u.id}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${GRADE_COLORS[u.grade] || GRADE_COLORS['General']}`}>
                    {u.grade || 'General'}
                  </span>
                </div>
              </div>
              <svg className="text-slate-300 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6">
          {loadingDetail && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
                <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
              </div>
            </div>
          )}
          {!loadingDetail && !detail && (
            <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <h3 className="text-base font-semibold text-slate-600">Selecciona un usuario</h3>
              <p className="text-sm">Haz clic en un usuario para ver su historial o administrarlo.</p>
            </div>
          )}
          {!loadingDetail && detail && (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* User header */}
              <div className="flex items-center gap-5 flex-wrap">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center text-2xl font-bold shrink-0 shadow-lg shadow-orange-500/20">
                  {(detail.user.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-bold text-slate-800">{detail.user.name}</h2>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${GRADE_COLORS[detail.user.grade] || GRADE_COLORS['General']}`}>
                      {detail.user.grade || 'General'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">ID en Lector: <span className="font-semibold text-slate-600 font-mono">#{detail.user.id}</span></p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFingerGuidanceUser({ id: detail.user.id, name: detail.user.name })}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200/60 hover:bg-orange-100 hover:border-orange-300 transition-all duration-200 shadow-sm active:scale-[0.97]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                    Enrolar Huella
                  </button>
                  <button
                    onClick={() => setEditUser({ id: detail.user.id, name: detail.user.name, grade: detail.user.grade || 'General' })}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 shadow-sm active:scale-[0.97]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Editar
                  </button>
                  <button onClick={() => setDeleteConfirm(detail.user.id)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-all duration-200 shadow-sm active:scale-[0.97]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { num: detail.stats.onTime, label: 'A tiempo', gradient: 'gradient-green' },
                  { num: detail.stats.late, label: 'Tarde', gradient: 'gradient-amber' },
                  { num: detail.stats.absent ?? 0, label: 'Faltas', gradient: 'gradient-red' },
                  { num: detail.stats.total, label: 'Días presente', gradient: 'gradient-blue' },
                ].map(s => (
                  <div key={s.label} className="relative group cursor-default">
                    <div className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-100"></div>
                    <div className="relative p-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${s.gradient} flex items-center justify-center shadow-sm shrink-0`}>
                        <span className="text-sm font-bold text-white">{s.num}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-500">{s.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Puntuality bar */}
              <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Puntualidad</span>
                  <span className="text-lg font-bold text-slate-800">{detail.stats.attendanceRate}%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-700" style={{ width: `${detail.stats.attendanceRate}%` }}></div>
                </div>
              </div>

              {/* History */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-4">Historial de días</h3>
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden max-h-[420px] overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Fecha', 'Entrada', 'Sal. refrigerio', 'Reg. refrigerio', 'Salida', 'Horas', 'Estado'].map(h => (
                          <th key={h} className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historyDays.map(day => (
                        <tr key={day.date} title={day.isAbsent ? 'Día laborable sin marcación' : undefined} className={`border-b border-slate-100 last:border-0 transition-colors ${
                          day.isAbsent ? 'bg-red-50/40' : day.status === 'late' ? 'bg-amber-50/40' : day.status === 'absent' ? 'bg-red-50/30' : 'hover:bg-slate-50'
                        }`}>
                          <td className="px-5 py-3.5 text-sm font-medium text-slate-700">
                            {renderSchoolDateStr(day.date)}
                            {day.needsReview && (
                              <span title={day.reviewReason || 'A revisar'} className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200/60 text-[10px] font-bold">⚠ {day.reviewReason || 'Revisar'}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-mono text-slate-500">{day.checkIn ? formatSchoolTime(day.checkIn) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-sm font-mono">
                            {day.lunchOut
                              ? <span className="text-slate-500">{formatSchoolTime(day.lunchOut)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-mono">
                            {day.lunchIn
                              ? <span className="text-slate-500">{formatSchoolTime(day.lunchIn)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-mono">
                            {day.checkOut
                              ? <span className="text-slate-500">{formatSchoolTime(day.checkOut)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-medium">
                            {day.hoursWorked ? <span className="text-slate-600">{day.hoursWorked}h</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                              day.isAbsent || day.status === 'absent'
                                ? 'bg-red-50 text-red-600 border border-red-200/50'
                                : day.status === 'late'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${day.isAbsent || day.status === 'absent' ? 'bg-red-500' : day.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                              {day.isAbsent ? 'Inasistencia' : day.status === 'late' ? 'Tarde' : day.status === 'absent' ? 'Falta' : 'A tiempo'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Eliminar usuario</h3>
                <p className="text-sm text-slate-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Se eliminará del dispositivo y de la base de datos, incluyendo todos sus registros de asistencia.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={deleteUser} disabled={deleting}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
                  deleting
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/25 active:scale-[0.98]'
                }`}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
                <h2 className="text-lg font-bold text-slate-800">Editar usuario</h2>
              </div>
              <button onClick={() => setEditUser(null)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ID de usuario (no modificable)</label>
                <input type="text" value={editUser.id} disabled
                  className="w-full px-4 py-3 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-sm outline-none cursor-not-allowed font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre completo</label>
                <input type="text" value={editUser.name} onChange={e => setEditUser(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" placeholder="Ej: Juan Pérez" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grado / Área</label>
                <select
                  value={editUser.grade || 'General'}
                  onChange={e => setEditUser(p => ({ ...p, grade: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 font-medium">
                  {GRADES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setEditUser(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={saveEditUser} disabled={editing || !editUser.name}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
                  editing || !editUser.name
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25 active:scale-[0.98]'
                }`}>
                {editing ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <h2 className="text-lg font-bold text-slate-800">Nuevo usuario</h2>
              </div>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ID de usuario</label>
                <input type="number" min="1" value={newUser.userId} onChange={e => setNewUser(p => ({ ...p, userId: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 font-mono" placeholder="Ej: 101" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre completo</label>
                <input type="text" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" placeholder="Ej: Juan Pérez" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grado / Área</label>
                <select
                  value={newUser.grade || '3° Secundaria - A'}
                  onChange={e => setNewUser(p => ({ ...p, grade: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 font-medium">
                  {GRADES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={createUser} disabled={creating || !newUser.userId || !newUser.name}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
                  creating || !newUser.userId || !newUser.name
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25 active:scale-[0.98]'
                }`}>
                {creating ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fingerprint registration guidance modal */}
      {fingerGuidanceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setFingerGuidanceUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><polyline points="9 12 11 14 15 10"/></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Registrar Huella en Lector</h2>
                  <p className="text-xs text-slate-400">Usuario sincronizado en el dispositivo</p>
                </div>
              </div>
              <button onClick={() => setFingerGuidanceUser(null)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-4 bg-orange-50/70 border border-orange-200/60 rounded-xl mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Usuario en dispositivo</span>
                  <p className="text-base font-bold text-slate-800">{fingerGuidanceUser.name}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">ID a buscar</span>
                  <p className="text-xl font-mono font-bold text-orange-600">#{fingerGuidanceUser.id}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm text-slate-600 mb-6">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <p className="font-semibold text-slate-800">Presiona "M/OK" en el lector físico</p>
                  <p className="text-xs text-slate-500">El menú abrirá directamente (sin bloqueo de administrador).</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <p className="font-semibold text-slate-800">Entra a "Usuarios" y busca el ID #{fingerGuidanceUser.id}</p>
                  <p className="text-xs text-slate-500">Verás que "{fingerGuidanceUser.name}" ya aparece en la lista.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div>
                  <p className="font-semibold text-slate-800">Selecciona "Huella" y apoya el dedo 3 veces</p>
                  <p className="text-xs text-slate-500">Presiona "OK" al terminar para guardar. ¡Listo para fichar!</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button onClick={() => setFingerGuidanceUser(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-500/20 transition-all">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}