import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Attendance from './Attendance';
import Users from './Users';
import Report from './Report';
import Incidencias from './Incidencias';
import Students from './Students';
import Horarios from './Horarios';

import { API } from './lib/apiBase';

function App() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const sync = async () => {
    setSyncing(true); setError(null); setSuccess(null);
    try {
      const r = await (await fetch(`${API}/sync/attendance`, { method: 'POST' })).json();
      if (!r.success) throw new Error(r.message);
      setLastSync(new Date().toLocaleTimeString());
      setSuccess('Sincronización exitosa');
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    }`;

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Sidebar */}
        <nav className="w-64 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 fixed left-3 top-3 bottom-3 rounded-2xl flex flex-col z-10 border border-white/5 shadow-2xl shadow-black/20">
          <div className="px-6 py-7 border-b border-white/5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">Asistencias</h2>
            </div>
            <p className="text-[11px] text-slate-500 font-medium tracking-wider uppercase">Sistema de control</p>
          </div>
          <div className="p-3 flex flex-col gap-1 flex-1">
            <NavLink to="/" end className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              Dashboard
            </NavLink>
            <NavLink to="/attendance" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Asistencias
            </NavLink>
            <NavLink to="/users" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Usuarios
            </NavLink>
            <NavLink to="/horarios" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Horarios
            </NavLink>
            <NavLink to="/report" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Reportes
            </NavLink>
            <NavLink to="/incidencias" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Incidencias
            </NavLink>
            <NavLink to="/students" className={linkClass}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5"/></svg>
              Estudiantes
            </NavLink>
          </div>
          <div className="px-5 py-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">ZK</div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-300">ZKTeco</span>
                <span className="text-[10px] text-slate-500">Online</span>
              </div>
            </div>
          </div>
        </nav>

        {/* Main */}
        <main className="flex-1 ml-[280px] p-8 max-w-6xl">
          {error && (
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium mb-6 animate-fade-in shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              {error}
              <button onClick={() => setError(null)} className="ml-auto w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-lg leading-none text-red-500 hover:bg-red-200 transition-colors">&times;</button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm font-medium mb-6 animate-fade-in shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              {success}
              <button onClick={() => setSuccess(null)} className="ml-auto w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-lg leading-none text-emerald-500 hover:bg-emerald-200 transition-colors">&times;</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard onSync={sync} syncing={syncing} lastSync={lastSync} setError={setError} />} />
            <Route path="/attendance" element={<Attendance setError={setError} setSuccess={setSuccess} />} />
            <Route path="/users" element={<Users setError={setError} setSuccess={setSuccess} />} />
            <Route path="/horarios" element={<Horarios setError={setError} setSuccess={setSuccess} />} />
            <Route path="/report" element={<Report setError={setError} />} />
            <Route path="/incidencias" element={<Incidencias setError={setError} setSuccess={setSuccess} />} />
            <Route path="/students" element={<Students setError={setError} setSuccess={setSuccess} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
