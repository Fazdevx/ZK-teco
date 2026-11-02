require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ZKDevice } = require('zklib-ng');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Zona horaria del colegio en minutos respecto a UTC (Perú = -300).
// El lector guarda la hora de pared del colegio; el instante UTC real se
// reconstruye con este offset, sin depender de la zona de la PC que ejecuta.
const TZ_OFFSET_MINUTES = (() => {
  const v = parseInt(process.env.SCHOOL_TZ_OFFSET_MINUTES, 10);
  return isNaN(v) ? -300 : v;
})();

function deviceTsToInstant(d) {
  const utcWall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return new Date(utcWall - TZ_OFFSET_MINUTES * 60000);
}

function dayKeyOf(date) {
  const s = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60000);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(s.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function main() {
  const ip = process.env.DEVICE_IP || '192.168.0.201';
  const port = parseInt(process.env.DEVICE_PORT) || 4370;
  const pwd = parseInt(process.env.DEVICE_PASSWORD) || 0;

  console.log(`Conectando a ${ip}:${port}...`);
  const device = new ZKDevice({ host: ip, port, password: pwd, timeoutMs: 10000 });
  await device.connect();
  console.log('Conectado.\n');

  // 1. Obtener usuarios
  console.log('Obteniendo usuarios...');
  const users = await device.users.list();
  const userMap = {};
  users.forEach(u => {
    userMap[parseInt(u.userId) || u.uid] = u.name || `Usuario ${u.userId}`;
  });
  console.log(`  → ${users.length} usuarios cargados.\n`);

  // 2. Obtener asistencias
  console.log('Obteniendo registros de asistencia...');
  const logs = await device.attendance.list();
  await device.disconnect();

  // 3. Filtrar solo hoy (día del colegio, NO medianoche local de la PC)
  const todayKey = dayKeyOf(new Date());

  const todayLogs = logs.filter(log => {
    return dayKeyOf(log.timestamp) === todayKey;
  });

  // Ordenar por hora
  todayLogs.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\n========================================`);
  console.log(` ASISTENCIAS DE HOY (${todayKey})`);
  console.log(` Total: ${todayLogs.length} registros`);
  console.log(`========================================\n`);

  if (todayLogs.length === 0) {
    console.log('No hay registros para hoy.');
  } else {
    const byUser = {};
    todayLogs.forEach(log => {
      const uid = parseInt(log.userId) || log.uid;
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(log);
    });

    for (const [uid, logs] of Object.entries(byUser)) {
      console.log(`  ${userMap[parseInt(uid)] || 'Usuario #' + uid}:`);
      logs.forEach(log => {
        const hh = String(log.timestamp.getHours()).padStart(2, '0');
        const mm = String(log.timestamp.getMinutes()).padStart(2, '0');
        console.log(`    → ${hh}:${mm} (hora del colegio)`);
      });
      console.log('');
    }
  }

  // 4. Guardar en Supabase
  console.log('Guardando en Supabase...');
  const records = todayLogs.map(log => ({
    user_id: parseInt(log.userId) || log.uid,
    check_time: deviceTsToInstant(log.timestamp).toISOString(),
    device_ip: ip
  }));

  if (records.length > 0) {
    const { error } = await supabase
      .from('attendance_logs')
      .upsert(records, { onConflict: 'user_id, check_time', ignoreDuplicates: true });

    if (error) {
      console.error('Error al guardar en Supabase:', error.message);
    } else {
      console.log(`  → ${records.length} registros guardados en Supabase.`);
    }
  } else {
    console.log('  → No hay registros para guardar.');
  }

  console.log('\n✅ Listo.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});