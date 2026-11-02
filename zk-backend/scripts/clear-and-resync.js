require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ZKDevice } = require('zklib-ng');

// Uso: node scripts/clear-and-resync.js --yes
// 1) Borra TODAS las marcaciones de attendance_logs en Supabase.
// 2) Re-sincroniza los usuarios y el historial completo del lector, guardando
//    cada marca como instante UTC real (hora de pared del colegio + offset).

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!process.argv.includes('--yes')) {
  console.error('ADVERTENCIA: este script ELIMINA todo el historial de attendance_logs.');
  console.error('Ejecuta de nuevo con --yes para confirmar.');
  process.exit(1);
}

const TZ_OFFSET_MINUTES = (() => {
  const v = parseInt(process.env.SCHOOL_TZ_OFFSET_MINUTES, 10);
  return isNaN(v) ? -300 : v;
})();

// decodeTime (zklib-ng) construye `new Date(y,m,d,h,min,s)` con la zona LOCAL
// de la PC; sus campos son la hora de pared del colegio. Reconstruimos esos
// campos como hora del colegio para obtener el instante UTC real.
function deviceTsToInstant(d) {
  const utcWall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return new Date(utcWall - TZ_OFFSET_MINUTES * 60000);
}

async function main() {
  // 1. Vaciar attendance_logs
  console.log('Vaciando attendance_logs...');
  const { error: delErr } = await supabase
    .from('attendance_logs')
    .delete()
    .neq('id', -1);
  if (delErr) throw delErr;
  console.log('  → attendance_logs vaciado.');

  // 2. Conectar al lector
  const ip = process.env.DEVICE_IP || '192.168.0.201';
  const port = parseInt(process.env.DEVICE_PORT) || 4370;
  const pwd = parseInt(process.env.DEVICE_PASSWORD) || 0;
  console.log(`Conectando a ${ip}:${port}...`);
  const device = new ZKDevice({ host: ip, port, password: pwd, timeoutMs: 10000 });
  await device.connect();
  console.log('Conectado.');

  // 3. Sincronizar usuarios
  const users = await device.users.list();
  const userRecords = users.map(u => ({
    id: parseInt(u.userId) || u.uid,
    name: u.name || `Usuario ${u.userId}`,
    card_number: u.card ? u.card.toString() : null
  }));
  const { error: ue } = await supabase.from('users').upsert(userRecords, { onConflict: 'id' });
  if (ue) throw ue;
  console.log(`  → ${userRecords.length} usuarios sincronizados.`);

  // 4. Sincronizar marcas (hora corregida a UTC)
  const logs = await device.attendance.list();
  await device.disconnect();

  const validUserIds = new Set(userRecords.map(u => u.id));
  const records = logs.map(log => ({
    user_id: parseInt(log.userId) || log.uid,
    check_time: deviceTsToInstant(log.timestamp).toISOString(),
    device_ip: ip
  })).filter(r => validUserIds.has(r.user_id));

  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from('attendance_logs').upsert(
      chunk,
      { onConflict: 'user_id, check_time', ignoreDuplicates: true }
    );
    if (error) throw error;
  }
  console.log(`  → ${records.length} marcas sincronizadas con instantes UTC corregidos.`);
  console.log('\n✅ Re-sincronización completa. Verifica en el sistema las horas del reporte.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});