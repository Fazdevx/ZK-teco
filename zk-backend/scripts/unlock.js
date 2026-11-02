// test-zk-unlock.js
require('dotenv').config();
const { ZKDevice } = require('zklib-ng');

// Configuración directa para el Lector 1
const DEVICE_IP = '192.168.0.215';
const DEVICE_PORT = 3718;
const DEVICE_PASSWORD = 0; // Por defecto, si no se cambió

async function unlockAdmin() {
    console.log(`🔍 Conectando a ${DEVICE_IP}:${DEVICE_PORT}...`);

    const device = new ZKDevice({
        host: DEVICE_IP,
        port: DEVICE_PORT,
        password: DEVICE_PASSWORD,
        timeoutMs: 10000, // 10 segundos
    });

    try {
        // Paso 1: Conectar
        await device.connect();
        console.log('✅ Conexión establecida correctamente.');

        // Paso 2: Obtener información para verificar que es un ZKTeco
        console.log('📡 Obteniendo información del dispositivo...');
        const info = await device.getInfo();
        console.log('📋 Información del dispositivo:');
        console.log(`   - Modelo: ${info.model || 'Desconocido'}`);
        console.log(`   - Serial: ${info.serialNumber || 'Desconocido'}`);
        console.log(`   - Firmware: ${info.firmwareVersion || 'Desconocido'}`);
        console.log(`   - Huellas almacenadas: ${info.userCount || 0}`);
        console.log(`   - Registros: ${info.recordCount || 0}`);

        // Paso 3: Desbloquear administradores
        console.log('🔓 Eliminando bloqueos de administrador...');
        await device.control.clearAdmins();
        console.log('✅ Administradores eliminados correctamente.');

        // Paso 4: Refrescar datos en el dispositivo
        console.log('🔄 Refrescando datos...');
        await device.control.refreshData();
        console.log('✅ Datos refrescados.');

        console.log('🎉 ¡Desbloqueo completado con éxito!');
        console.log('👉 Ahora deberías poder entrar al menú presionando M/OK sin pedir huella o contraseña.');
    } catch (error) {
        console.error('❌ Error durante el proceso:');
        console.error(`   - Código: ${error.code || 'N/A'}`);
        console.error(`   - Mensaje: ${error.message}`);
        if (error.stack) {
            console.error('   - Stack:', error.stack);
        }
    } finally {
        try {
            await device.disconnect();
            console.log('🔌 Desconectado del dispositivo.');
        } catch (e) {
            // ignorar errores al desconectar
        }
    }
}

// Ejecutar
unlockAdmin();