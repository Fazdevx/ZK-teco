const { ZKDevice } = require('zklib-ng');

const ip = '192.168.0.215';
const puertos = [4370, 3718, 5005, 8080, 6000, 7000, 8081, 8443, 80, 443];

async function testPort(port) {
    console.log(`\n📡 Probando ${ip}:${port} ...`);
    const device = new ZKDevice({ host: ip, port, password: 0, timeoutMs: 5000 });

    try {
        await device.connect();
        console.log(`✅ Conexión exitosa en el puerto ${port}!`);

        // Intentar obtener información
        try {
            const info = await device.getInfo();
            console.log('   Información del dispositivo:', info);
            console.log('   ✅ Comunicación completa.');

            // Si llegamos aquí, intentamos desbloquear
            console.log('   🔓 Intentando eliminar administradores...');
            await device.control.clearAdmins();
            await device.control.refreshData();
            console.log('   ✅ Administradores eliminados en este puerto!');
        } catch (infoErr) {
            console.log('   ❌ No se pudo obtener información (pero la conexión TCP fue exitosa):', infoErr.message);
        }

        await device.disconnect();
        return true;
    } catch (err) {
        console.log(`❌ Error en puerto ${port}: ${err.message}`);
        return false;
    }
}

(async () => {
    console.log('🔍 Escaneando puertos para el Lector 1...');
    let found = false;
    for (const p of puertos) {
        if (await testPort(p)) {
            found = true;
            break; // si encuentra uno, detenemos el escaneo
        }
    }
    if (!found) {
        console.log('\n❌ Ningún puerto funcionó con zklib-ng.');
        console.log('👉 Sugerencia: Usa ZKAccess 3.5 para escanear el dispositivo y averiguar su modo.');
    }
})();