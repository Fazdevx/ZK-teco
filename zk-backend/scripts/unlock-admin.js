require('dotenv').config();
const { ZKDevice } = require('zklib-ng');

async function unlockAdmin() {
  const ip = process.env.DEVICE_IP || '192.168.0.201';
  const port = parseInt(process.env.DEVICE_PORT) || 4370;
  const pwd = parseInt(process.env.DEVICE_PASSWORD) || 0;

  console.log(`Conectando a ${ip}:${port}...`);
  const device = new ZKDevice({ host: ip, port, password: pwd, timeoutMs: 10000 });

  try {
    await device.connect();
    console.log('Conectado exitosamente.');

    console.log('Eliminando bloqueos de administrador del dispositivo...');
    await device.control.clearAdmins();
    await device.control.refreshData();

    console.log('✅ Bloqueos de administrador eliminados con éxito.');
    console.log('👉 Ahora puedes presionar "M/OK" o "Menú" en el lector físico para entrar directamente sin pedir administrador ni huella.');
  } catch (error) {
    console.error('❌ Error al desbloquear el administrador:', error.message);
  } finally {
    try {
      await device.disconnect();
    } catch {}
  }
}

unlockAdmin();
