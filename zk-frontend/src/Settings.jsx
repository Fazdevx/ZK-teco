import { useState, useEffect } from 'react';

import { API } from './lib/apiBase';

// Componente fuera del render principal (evita recrearlo en cada render).
function TimeInput({ label, hourKey, minKey, settings, onChangeNum }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min="0" max="23" value={settings[hourKey] ?? 0}
          onChange={e => onChangeNum(hourKey, e.target.value)}
          className="w-16 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base font-bold text-center outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
        <span className="text-lg font-bold text-slate-300">:</span>
        <input type="number" min="0" max="59" value={settings[minKey] ?? 0}
          onChange={e => onChangeNum(minKey, e.target.value)}
          className="w-16 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base font-bold text-center outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
      </div>
    </div>
  );
}

export default function Settings({ setError, setSuccess }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/settings`)
      .then(r => r.json())
      .then(r => { if (r.success) setSettings(r.data); })
      .catch(() => setError('Error al cargar configuración'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));
  const updateNum = (key, val) => setSettings(prev => ({ ...prev, [key]: parseInt(val) || 0 }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await (await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })).json();
      if (r.success) { setSuccess('Configuración guardada'); setSettings(r.data); }
      else throw new Error(r.message);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200"></div>
        <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-orange-500 absolute inset-0 animate-spin"></div>
      </div>
      <p className="text-sm font-medium text-slate-400">Cargando configuración...</p>
    </div>
  );
  if (!settings) return <div className="text-center py-20 text-slate-500"><h3 className="text-base font-semibold">Error al cargar configuración</h3></div>;

  const rules = [
    { icon: '✓', gradient: 'gradient-green', text: <>A tiempo — Marcar antes de las <strong>{String(settings.lateHour).padStart(2,'0')}:{String(settings.lateMinute).padStart(2,'0')}</strong>{settings.toleranceMinutes > 0 && ` (${settings.toleranceMinutes} min de tolerancia)`}{` · sábados antes de las ${String(settings.saturdayLateHour ?? 8).padStart(2,'0')}:${String(settings.saturdayLateMinute ?? 0).padStart(2,'0')}`}</> },
    { icon: '!', gradient: 'gradient-amber', text: <>Tarde — Marcar después del límite ({String(settings.lateHour).padStart(2,'0')}:{String(settings.lateMinute).padStart(2,'0')}; sábados {String(settings.saturdayLateHour ?? 8).padStart(2,'0')}:{String(settings.saturdayLateMinute ?? 0).padStart(2,'0')})</> },
    { icon: '✕', gradient: 'gradient-red', text: <>Ausente — No registrar ninguna marcación en el día</> },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Configuración</h1>
        <p className="text-sm text-slate-400 mt-1">Define las reglas de asistencia del sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Settings form */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700">Horario laboral</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <TimeInput label="Hora de entrada" hourKey="workStartHour" minKey="workStartMinute" settings={settings} onChangeNum={updateNum} />
            <TimeInput label="Hora de salida" hourKey="workEndHour" minKey="workEndMinute" settings={settings} onChangeNum={updateNum} />
            <TimeInput label="Límite de tardanza" hourKey="lateHour" minKey="lateMinute" settings={settings} onChangeNum={updateNum} />
            <TimeInput label="Inasistencia desde" hourKey="absenceAfterHour" minKey="absenceAfterMinute" settings={settings} onChangeNum={updateNum} />
            <TimeInput label="Límite tardanza (sábado)" hourKey="saturdayLateHour" minKey="saturdayLateMinute" settings={settings} onChangeNum={updateNum} />
            <TimeInput label="Inasistencia sábado desde" hourKey="saturdayAbsenceAfterHour" minKey="saturdayAbsenceAfterMinute" settings={settings} onChangeNum={updateNum} />
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tolerancia</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="120" value={settings.toleranceMinutes}
                  onChange={e => updateNum('toleranceMinutes', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base font-bold outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
                <span className="text-sm font-medium text-slate-400">min</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Doble marcación (min)</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="10" value={settings.doubleTapToleranceMinutes ?? 1}
                  onChange={e => updateNum('doubleTapToleranceMinutes', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base font-bold outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
                <span className="text-sm font-medium text-slate-400">min</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-slate-600 leading-relaxed">
            <strong className="text-amber-700">Regla de inasistencia:</strong> si la <strong>primera marcación</strong> del día es a partir de las <strong>{String(settings.absenceAfterHour ?? 9).padStart(2, '0')}:{String(settings.absenceAfterMinute ?? 0).padStart(2, '0')}</strong> (sábados: {String(settings.saturdayAbsenceAfterHour ?? 9).padStart(2, '0')}:{String(settings.saturdayAbsenceAfterMinute ?? 0).padStart(2, '0')}), se cuenta como falta (no como tardanza). Los minutos tarde solo se suman por lo que tardó al ingresar.
          </div>
          <div className="mt-2 p-3.5 bg-red-50/70 border border-red-200/60 rounded-xl text-xs text-slate-600 leading-relaxed">
            <strong className="text-red-700">Doble marcación:</strong> dos huellas consecutivas del mismo {settings.doubleTapToleranceMinutes > 0 ? <>día con menos de <strong>{settings.doubleTapToleranceMinutes} min</strong> de diferencia se tratan como <strong>una sola</strong> marca (no rompen Entrada → Refrigerio → Salida)</> : <>con esta regla desactivada (0). Actívala si el lector produce dobles toques</>}. Los días que se auto-corrijan y los que queden con más de 4 marcas aparecen con <strong>⚠ Revisar</strong> en el Reporte para editarlos manualmente.
          </div>

          {/* Auto-sync section */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg>
              </div>
              <h3 className="text-sm font-bold text-slate-700">Sincronización automática</h3>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">Sincronización programada</span>
                <span className="text-xs text-slate-400">Sincroniza usuarios y asistencias automáticamente</span>
              </div>
              <button onClick={() => update('autoSync', !settings.autoSync)}
                className={`relative w-12 h-6.5 rounded-full transition-all duration-200 ${settings.autoSync ? 'bg-orange-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${settings.autoSync ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
            {settings.autoSync && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Intervalo (minutos)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="60" value={settings.autoSyncInterval}
                    onChange={e => updateNum('autoSyncInterval', e.target.value)}
                    className="w-20 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base font-bold text-center outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
                  <span className="text-sm font-medium text-slate-400">minutos</span>
                </div>
              </div>
            )}
          </div>

          {/* Admin password section */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Contraseña de administrador</h3>
                <p className="text-xs text-slate-400">Se pide al editar o eliminar asistencias</p>
              </div>
            </div>
            <input type="text" value={settings.adminPassword || ''}
              onChange={e => update('adminPassword', e.target.value)}
              placeholder="admin123"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 shadow-sm" />
          </div>

          <button onClick={save} disabled={saving}
            className={`mt-6 w-full px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
              saving
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/25 active:scale-[0.98]'
            }`}>
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>

        {/* Rules */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-700">Reglas actuales</h3>
          </div>

          <div className="flex flex-col gap-3">
            {rules.map((r, i) => (
              <div key={i} className="flex items-start gap-4 px-4 py-4 bg-slate-50 rounded-xl border border-slate-100/50">
                <div className={`w-8 h-8 rounded-lg ${r.gradient} flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm`}>
                  {r.icon}
                </div>
                <p className="text-sm leading-relaxed text-slate-600 pt-0.5">{r.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-orange-50/50 rounded-xl border border-orange-100/50">
            <div className="flex items-center gap-2 text-xs text-orange-700 font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Los cambios se aplican inmediatamente al guardar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
