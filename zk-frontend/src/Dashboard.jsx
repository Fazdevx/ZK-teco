import { useState, useEffect } from 'react';
import { formatSchoolTime, loadSchoolOffset } from './lib/schoolTime';

import { API } from './lib/apiBase';

export default function Dashboard({ onSync, syncing, lastSync, setError }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('all');

  useEffect(() => {
    loadSchoolOffset(API);
    fetch(`${API}/data/users`)
      .then(r => r.json())
      .then(r => { if (r.success) { const m = {}; r.data.forEach(u => m[u.id] = u.name); setUsers(m); } })
      .catch(() => {});
  }, [lastSync]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (gradeFilter && gradeFilter !== 'all') params.set('grade', gradeFilter);
      const r = await (await fetch(`${API}/data/dashboard?${params}`)).json();
      if (r.success) setStats(r.data);
    } catch { setError('Error al cargar estadísticas'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, [lastSync, gradeFilter]);

  if (loading && !stats) return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200"></div>
        <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
      </div>
      <p className="text-sm font-medium text-slate-400">Cargando dashboard...</p>
    </div>
  );

  const t = stats?.today || {};
  const expectedToday = stats?.expectedToday ?? stats?.totalUsers;
  const checkedInPct = expectedToday > 0 ? Math.round((t.checkedIn / expectedToday) * 100) : 0;
  const onTimePct = t.checkedIn > 0 ? Math.round((t.onTime / t.checkedIn) * 100) : 0;
  const checkoutPct = t.checkedIn > 0 ? Math.round((t.withCheckout / t.checkedIn) * 100) : 0;

  const StatCard = ({ num, label, gradient, icon }) => (
    <div className="relative group cursor-default">
      <div className="absolute inset-0 bg-white rounded-2xl shadow-lg shadow-slate-200/50 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-slate-300/50 group-hover:-translate-y-0.5"></div>
      <div className="relative p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${gradient} flex items-center justify-center shadow-lg shrink-0`}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-slate-800 tracking-tight">{num}</span>
          <span className="text-xs font-medium text-slate-400">{label}</span>
        </div>
      </div>
    </div>
  );

  const ProgressCard = ({ label, value, total, pct, gradient, color }) => (
    <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-slate-700">{value}<span className="text-slate-300 font-normal">/{total}</span></span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${gradient} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Resumen de asistencia del día</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Grade filter */}
          <select
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
            className="px-4 py-2.5 bg-white rounded-xl text-xs font-semibold text-slate-700 border border-slate-200 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10">
            <option value="all">Todo el colegio</option>
            <option value="secundaria_alta">⭐ 3°, 4° y 5° Secundaria</option>
            <option value="3° Secundaria - A">3° Secundaria - A</option>
            <option value="3° Secundaria - B">3° Secundaria - B</option>
            <option value="4° Secundaria - A">4° Secundaria - A</option>
            <option value="4° Secundaria - B">4° Secundaria - B</option>
            <option value="5° Secundaria">5° Secundaria</option>
            <option value="Docentes / Personal">Docentes / Personal</option>
            <option value="General">General</option>
          </select>

          <button onClick={onSync} disabled={syncing}
            className={`inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
              syncing
                ? 'bg-slate-400 cursor-not-allowed opacity-70'
                : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25 hover:shadow-orange-500/40 active:scale-[0.97]'
            }`}>
            {syncing ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Sincronizando...</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg> Sincronizar</>
            )}
          </button>
        </div>
      </div>
      {lastSync && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-6 -mt-4">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Última sincronización: {lastSync}
        </div>
      )}

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard num={stats?.totalUsers || 0} label="Usuarios registrados" gradient="gradient-blue" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} />
        <StatCard num={t.onTime || 0} label="Llegaron a tiempo" gradient="gradient-green" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard num={t.late || 0} label="Llegaron tarde" gradient="gradient-amber" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard num={t.absent || 0} label="Ausentes hoy" gradient="gradient-red" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} />
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ProgressCard label="Asistencia (esperados hoy)" value={t.checkedIn || 0} total={expectedToday || 0} pct={checkedInPct} gradient="gradient-blue" />
        <ProgressCard label="Puntualidad" value={t.onTime || 0} total={t.checkedIn || 0} pct={onTimePct} gradient="gradient-green" />
        <ProgressCard label="Registraron salida" value={t.withCheckout || 0} total={t.checkedIn || 0} pct={checkoutPct} gradient="gradient-purple" />
      </div>

      {/* Late & Early lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700">Llegadas tarde</h3>
            {stats?.lateList?.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">{stats.lateList.length}</span>}
          </div>
          {stats?.lateList?.length > 0 ? (
            <div className="flex flex-col gap-1">
              {stats.lateList.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50/50 border border-amber-100/50 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    {(users[item.user_id] || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700 truncate">{users[item.user_id] || `#${item.user_id}`}</div>
                    <div className="text-xs text-slate-400 font-mono">{formatSchoolTime(item.time)}</div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 shrink-0">Tarde</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <p className="text-sm font-medium text-slate-500">Todos llegaron a tiempo hoy</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><path d="M17 11l-5-5-5 5"/><path d="M17 18l-5-5-5 5"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700">Salidas temprano</h3>
            {stats?.earlyList?.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ml-auto">{stats.earlyList.length}</span>}
          </div>
          {stats?.earlyList?.length > 0 ? (
            <div className="flex flex-col gap-1">
              {stats.earlyList.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50/50 border border-purple-100/50 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    {(users[item.user_id] || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700 truncate">{users[item.user_id] || `#${item.user_id}`}</div>
                    <div className="text-xs text-slate-400 font-mono">{formatSchoolTime(item.time)}</div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 shrink-0">Temprano</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <p className="text-sm font-medium text-slate-500">Nadie salió temprano hoy</p>
            </div>
          )}
        </div>
      </div>

      {/* Weekly trend */}
      {stats?.weeklyTrend?.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700">Tendencia semanal</h3>
          </div>
          <div className="flex gap-4 items-end h-40 px-4">
            {stats.weeklyTrend.map(({ date, dayName, count }, i) => {
              const max = Math.max(...stats.weeklyTrend.map(t => t.count));
              const pct = max > 0 ? (count / max) * 100 : 0;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-2 h-full animate-slide-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="text-xs font-bold text-slate-600">{count}</span>
                  <div className="flex-1 w-full bg-slate-50 rounded-lg relative flex items-end border border-slate-100">
                    <div className="w-full rounded-lg bg-gradient-to-t from-orange-500 to-orange-400 transition-all duration-700 ease-out shadow-sm" style={{ height: `${pct}%`, minHeight: pct > 0 ? '8px' : '0' }}></div>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{dayName?.substring(0, 3)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}