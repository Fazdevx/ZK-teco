import { useState, useEffect } from 'react';
import { formatSchoolDate, renderSchoolDateStr, loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

export default function Incidencias({ setError, setSuccess }) {
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ userId: '', date: new Date().toISOString().split('T')[0], type: 'forgot', description: '' });

  const loadIncidents = () => {
    fetch(`${API}/incidents`).then(r => r.json()).then(r => { if (r.success) setIncidents(r.data); }).catch(() => {});
  };

  useEffect(() => {
    loadSchoolOffset(API);
    Promise.all([
      fetch(`${API}/data/users`).then(r => r.json()),
      fetch(`${API}/incidents`).then(r => r.json())
    ]).then(([u, i]) => {
      if (u.success) { const m = {}; u.data.forEach(x => m[x.id] = x.name); setUsers(m); }
      if (i.success) setIncidents(i.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    try {
      const r = await (await fetch(`${API}/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(form.userId), date: form.date, type: form.type, description: form.description })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess('Incidencia registrada');
      setShowForm(false);
      setForm({ userId: '', date: new Date().toISOString().split('T')[0], type: 'forgot', description: '' });
      loadIncidents();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    try {
      await fetch(`${API}/incidents/${id}`, { method: 'DELETE' });
      loadIncidents();
    } catch {}
  };

  const typeLabels = { forgot: 'Olvido de marcación', broken: 'Lector dañado', permission: 'Permiso', other: 'Otro' };
  const typeColors = { forgot: 'bg-amber-50 text-amber-700 border-amber-200', broken: 'bg-red-50 text-red-700 border-red-200', permission: 'bg-blue-50 text-blue-700 border-blue-200', other: 'bg-slate-50 text-slate-700 border-slate-200' };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Incidencias</h1>
          <p className="text-sm text-slate-400 mt-1">Registra olvidos de marcación, lectores dañados, permisos, etc.</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.97] transition-all duration-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva incidencia
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative"><div className="w-10 h-10 rounded-full border-4 border-slate-200"></div><div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div></div>
            <p className="text-sm font-medium text-slate-400">Cargando...</p>
          </div>
        ) : incidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  {['Empleado', 'Fecha', 'Tipo', 'Descripción', 'Registrada', ''].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.sort((a, b) => b.id - a.id).map(inc => (
                  <tr key={inc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-semibold text-slate-700">{users[inc.userId] || `#${inc.userId}`}</td>
                    <td className="px-5 py-4 text-sm font-mono text-slate-500">{renderSchoolDateStr(inc.date)}</td>
                    <td className="px-5 py-4"><span className={`inline-flex text-xs font-semibold px-3 py-1.5 rounded-full border ${typeColors[inc.type] || typeColors.other}`}>{typeLabels[inc.type] || inc.type}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-500 max-w-xs truncate">{inc.description || '—'}</td>
                    <td className="px-5 py-4 text-xs text-slate-400">{formatSchoolDate(inc.createdAt)}</td>
                    <td className="px-5 py-4"><button onClick={() => remove(inc.id)} className="text-red-400 hover:text-red-600 transition-colors"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-600">Sin incidencias</h3>
            <p className="text-sm">No hay incidencias registradas.</p>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 className="text-lg font-bold text-slate-800">Nueva incidencia</h2>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Empleado</label>
                <select value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                  <option value="">Seleccionar...</option>
                  {Object.entries(users).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                  <option value="forgot">Olvido de marcación</option>
                  <option value="broken">Lector dañado</option>
                  <option value="permission">Permiso</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripción</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 resize-none" placeholder="Detalles opcionales..." />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={submit} disabled={!form.userId || !form.date}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}