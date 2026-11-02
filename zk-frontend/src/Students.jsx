import { useState, useEffect } from 'react';
import { formatSchoolTime, renderSchoolDateStr, schoolDayKey, loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

const GRADE_COLORS = {
  '3° Secundaria - A': 'bg-amber-50 text-amber-700 border-amber-200/60',
  '3° Secundaria - B': 'bg-yellow-50 text-yellow-700 border-yellow-200/60',
  '4° Secundaria - A': 'bg-orange-50 text-orange-700 border-orange-200/60',
  '4° Secundaria - B': 'bg-red-50 text-red-700 border-red-200/60',
  '5° Secundaria': 'bg-rose-50 text-rose-700 border-rose-200/60',
  'Docentes / Personal': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'General': 'bg-slate-50 text-slate-600 border-slate-200/60'
};

const TYPE_META = {
  late: { label: 'Tardanza', className: 'bg-amber-50 text-amber-700 border-amber-200/50', dot: 'bg-amber-500' },
  absent: { label: 'Inasistencia', className: 'bg-red-50 text-red-700 border-red-200/50', dot: 'bg-red-500' }
};

export default function Students({ setError, setSuccess }) {
  const [tab, setTab] = useState('incidents');
  const [contacts, setContacts] = useState([]);
  const [students, setStudents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState(() => {
    const today = schoolDayKey(new Date());
    return { from: today, to: today };
  });
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ parent_name: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(null);

  const loadContacts = async () => {
    try {
      const r = await (await fetch(`${API}/parent-contacts`)).json();
      if (r.success) setContacts(r.data || []);
      else if (r.message && r.message.includes('no existe')) {
        setContacts([]);
      }
    } catch (err) { /* tabla no existe u offline */ }
  };

  const loadStudents = async () => {
    try {
      const r = await (await fetch(`${API}/data/users`)).json();
      if (r.success) {
        const filtered = (r.data || []).filter(u => {
          const g = (u.grade || 'General').toLowerCase();
          return !g.includes('docente') && !g.includes('personal');
        });
        setStudents(filtered);
      }
    } catch (err) { /* fallback vacío */ }
  };

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
      if (gradeFilter && gradeFilter !== 'all') params.set('grade', gradeFilter);
      const r = await (await fetch(`${API}/student-incidents?${params}`)).json();
      if (r.success) setIncidents(r.data || []);
    } catch { setError('Error al cargar incidencias'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSchoolOffset(API); loadStudents(); }, []);
  useEffect(() => { loadContacts(); }, []);
  useEffect(() => { loadIncidents(); }, [dateRange, gradeFilter]);

  // ─── Contacts management ───
  const contactMap = contacts.reduce((acc, c) => { acc[c.user_id] = c; return acc; }, {});

  const openContactEditor = (userId) => {
    const existing = contactMap[userId];
    setEditingContact(userId);
    setContactForm({
      parent_name: existing?.parent_name || '',
      phone: existing?.phone || ''
    });
  };

  const saveContact = async () => {
    if (!editingContact) return;
    if (!contactForm.phone || !/^\d{9,15}$/.test(contactForm.phone.replace(/\D/g, ''))) {
      setError('Ingresa un teléfono válido (solo dígitos, 9-15 caracteres)');
      return;
    }
    setSavingContact(true);
    try {
      const cleanPhone = contactForm.phone.replace(/\D/g, '');
      const r = await (await fetch(`${API}/parent-contacts/${editingContact}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_name: contactForm.parent_name, phone: cleanPhone })
      })).json();
      if (!r.success) throw new Error(r.message);
      setSuccess('Contacto guardado');
      setEditingContact(null);
      loadContacts();
    } catch (e) { setError(e.message); }
    finally { setSavingContact(false); }
  };

  const deleteContact = async (userId) => {
    if (!window.confirm('¿Eliminar el contacto de WhatsApp de este estudiante?')) return;
    try {
      await fetch(`${API}/parent-contacts/${userId}`, { method: 'DELETE' });
      setSuccess('Contacto eliminado');
      loadContacts();
    } catch (e) { setError(e.message); }
  };

  // ─── WhatsApp send ───
  const sendWhatsApp = async (incident) => {
    const contact = contactMap[incident.user_id];
    if (!contact || !contact.phone) {
      setError(`Sin contacto de WhatsApp para ${incident.user_name}. Agregalo en la pestaña Contactos.`);
      return;
    }
    setSendingMessage(incident.user_id + incident.date);
    try {
      const buildR = await (await fetch(`${API}/whatsapp/build-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: incident.user_name,
          date: incident.date,
          type: incident.type,
          time: incident.time,
          minutesLate: incident.minutes_late
        })
      })).json();
      if (!buildR.success) throw new Error(buildR.message);

      // Construir URL manualmente para usar openExternal del preload (más seguro
      // en .exe que spawn cmd /c start). Si no hay preload (modo dev), caemos
      // al endpoint del backend que sí hace spawn.
      const url = `https://wa.me/${contact.phone}?text=${encodeURIComponent(buildR.data.message)}`;
      let opened = false;
      try {
        if (window.zkteco && typeof window.zkteco.openExternal === 'function') {
          opened = window.zkteco.openExternal(url);
        }
      } catch (err) {
        console.error('[WhatsApp] openExternal falló:', err.message, err.stack);
        opened = false;
      }
      if (!opened && typeof window !== 'undefined' && window.location.protocol !== 'file:') {
        // En el navegador (Vercel) se abre una pestaña; el backend no puede
        // ejecutar programas del sistema en serverless.
        try { opened = window.open(url, '_blank', 'noopener,noreferrer') !== null; }
        catch { opened = false; }
      }
      if (!opened) {
        // Fallback: el backend hace spawn del SO (modo desktop/dev)
        const sendR = await (await fetch(`${API}/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: contact.phone,
            message: buildR.data.message,
            userName: incident.user_name
          })
        })).json();
        if (!sendR.success) throw new Error(sendR.message);
      }
      setSuccess(`WhatsApp abierto para ${incident.user_name} (${contact.phone})`);
    } catch (e) { setError(e.message); }
    finally { setSendingMessage(null); }
  };

  const filteredIncidents = incidents.filter(i => typeFilter === 'all' || i.type === typeFilter);
  const filteredStudents = students.filter(u => gradeFilter === 'all' || u.grade === gradeFilter);

  const gradeOptions = [
    { value: 'all', label: 'Todos los grados' },
    { value: '3° Secundaria - A', label: '3° Secundaria - A' },
    { value: '3° Secundaria - B', label: '3° Secundaria - B' },
    { value: '4° Secundaria - A', label: '4° Secundaria - A' },
    { value: '4° Secundaria - B', label: '4° Secundaria - B' },
    { value: '5° Secundaria', label: '5° Secundaria' }
  ];

  const stats = {
    total: incidents.length,
    late: incidents.filter(i => i.type === 'late').length,
    absent: incidents.filter(i => i.type === 'absent').length,
    contacts: contacts.length
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estudiantes</h1>
        <p className="text-sm text-slate-400 mt-1">
          Gestiona contactos de padres y reporta tardanzas e inasistencias por WhatsApp
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { num: stats.late, label: 'Tardanzas', gradient: 'gradient-amber', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { num: stats.absent, label: 'Inasistencias', gradient: 'gradient-red', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
          { num: stats.contacts, label: 'Contactos registrados', gradient: 'gradient-green', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
          { num: filteredStudents.length, label: 'Estudiantes activos', gradient: 'gradient-blue', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
        ].map(s => (
          <div key={s.label} className="relative group cursor-default">
            <div className="absolute inset-0 bg-white rounded-2xl shadow-lg shadow-slate-200/50 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-slate-300/50 group-hover:-translate-y-0.5"></div>
            <div className="relative p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                {s.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-slate-800 tracking-tight">{s.num}</span>
                <span className="text-xs font-medium text-slate-400">{s.label}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200 mb-5 w-fit">
        <button onClick={() => setTab('incidents')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            tab === 'incidents' ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}>
          Tardanzas e Inasistencias
        </button>
        <button onClick={() => setTab('contacts')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
            tab === 'contacts' ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}>
          Contactos de Padres
        </button>
      </div>

      {tab === 'incidents' && (
        <>
          {/* Filters */}
          <div className="flex items-end gap-3 flex-wrap mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Desde</label>
              <input type="date" value={dateRange.from} max={dateRange.to}
                onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hasta</label>
              <input type="date" value={dateRange.to} min={dateRange.from}
                onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grado</label>
              <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                {gradeOptions.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</label>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                <option value="all">Todos</option>
                <option value="late">Tardanzas</option>
                <option value="absent">Inasistencias</option>
              </select>
            </div>
          </div>

          {/* Incidents table */}
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
                  <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
                </div>
                <p className="text-sm font-medium text-slate-400">Cargando...</p>
              </div>
            ) : filteredIncidents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Estudiante', 'Grado', 'Fecha', 'Tipo', 'Hora', 'WhatsApp', ''].map(h => (
                        <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncidents.map((inc, idx) => {
                      const contact = contactMap[inc.user_id];
                      const meta = TYPE_META[inc.type];
                      return (
                        <tr key={`${inc.user_id}-${inc.date}-${idx}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                                {(inc.user_name || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-slate-700">{inc.user_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${GRADE_COLORS[inc.grade] || GRADE_COLORS['General']}`}>
                              {inc.grade || 'General'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm font-mono text-slate-500">
                            {renderSchoolDateStr(inc.date)}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${meta.className}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm font-mono text-slate-500">
                            {inc.time ? formatSchoolTime(inc.time) : <span className="text-slate-300">—</span>}
                            {inc.minutes_late > 0 && <span className="text-amber-600 font-semibold ml-2">+{inc.minutes_late}min</span>}
                          </td>
                          <td className="px-5 py-4">
                            {contact ? (
                              <div className="flex flex-col">
                                <span className="text-xs font-semibold text-slate-700 font-mono">{contact.phone}</span>
                                {contact.parent_name && <span className="text-[10px] text-slate-400">{contact.parent_name}</span>}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 italic">Sin contacto</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={() => sendWhatsApp(inc)}
                              disabled={!contact || (sendingMessage === inc.user_id + inc.date)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                !contact
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : sendingMessage === inc.user_id + inc.date
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/25 active:scale-[0.97]'
                              }`}>
                              {sendingMessage === inc.user_id + inc.date ? (
                                <><span className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin"></span> Enviando...</>
                              ) : (
                                <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Enviar</>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <h3 className="text-base font-semibold text-slate-600">Sin incidencias</h3>
                <p className="text-sm">No hay tardanzas ni inasistencias en el rango seleccionado.</p>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'contacts' && (
        <>
          {/* Grade filter */}
          <div className="flex items-end gap-3 flex-wrap mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grado</label>
              <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
                {gradeOptions.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="text-xs text-slate-500 self-end pb-2.5">
              {filteredStudents.length} estudiantes · {filteredStudents.filter(u => contactMap[u.id]).length} con contacto
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
                  <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Estudiante', 'Grado', 'Nombre del padre', 'WhatsApp', ''].map(h => (
                        <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(u => {
                      const c = contactMap[u.id];
                      const isEditing = editingContact === u.id;
                      return (
                        <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                                {(u.name || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-slate-700">{u.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${GRADE_COLORS[u.grade] || GRADE_COLORS['General']}`}>
                              {u.grade || 'General'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {isEditing ? (
                              <input type="text" value={contactForm.parent_name}
                                onChange={e => setContactForm(p => ({ ...p, parent_name: e.target.value }))}
                                placeholder="Opcional"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                            ) : (
                              <span className="text-sm text-slate-600">{c?.parent_name || <span className="text-slate-300 italic">—</span>}</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {isEditing ? (
                              <input type="tel" value={contactForm.phone}
                                onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                                placeholder="51912345678"
                                className="w-40 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                            ) : (
                              <span className={`text-sm font-mono ${c?.phone ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                                {c?.phone || '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <button onClick={saveContact} disabled={savingContact}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-sm disabled:bg-slate-300">
                                  {savingContact ? '...' : 'Guardar'}
                                </button>
                                <button onClick={() => setEditingContact(null)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button onClick={() => openContactEditor(u.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200">
                                  {c ? 'Editar' : 'Agregar'}
                                </button>
                                {c && (
                                  <button onClick={() => deleteContact(u.id)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100">
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Contact editor modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingContact(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">
                {contactMap[editingContact] ? 'Editar contacto' : 'Agregar contacto'}
              </h2>
              <button onClick={() => setEditingContact(null)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre del padre/madre (opcional)</label>
                <input type="text" value={contactForm.parent_name}
                  onChange={e => setContactForm(p => ({ ...p, parent_name: e.target.value }))}
                  placeholder="Ej: María López"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Número de WhatsApp *</label>
                <input type="tel" value={contactForm.phone}
                  onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="51912345678"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10" />
                <span className="text-xs text-slate-400">Solo dígitos con código de país (ej. Perú: 51 + 9 dígitos)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setEditingContact(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={saveContact} disabled={savingContact}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md disabled:bg-slate-300">
                {savingContact ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}