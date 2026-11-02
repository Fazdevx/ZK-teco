'use strict';

const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const APP_VERSION = require('./package.json').version;

// ─── Rutas ────────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;

const BACKEND_DIR = isDev
  ? path.join(__dirname, '..', 'zk-backend')
  : path.join(process.resourcesPath, 'zk-backend');

const FRONTEND_DIR = isDev
  ? path.join(__dirname, '..', 'zk-frontend', 'dist')
  : path.join(process.resourcesPath, 'zk-frontend-dist');

const BACKEND_PORT = 5000;
const BACKEND_HOST = '127.0.0.1';

let mainWindow = null;
let backendProcess = null;
let backendReady = false;

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Buscar Node.js real ──────────────────────────────────────────────────────
// process.execPath en Electron apunta al binario de Electron, NO a node.
// Prioridad:
//   1. node.exe portable empaquetado dentro del .exe (resources/node-portable/)
//   2. Instalaciones conocidas de Node en Windows
//   3. 'node' en PATH del sistema (fallback)
function findNodeExecutable() {
  const candidates = [
    path.join(process.resourcesPath, 'node-portable', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(process.env.APPDATA || '', 'nvm', 'current', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'nvm', 'current', 'node.exe'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        console.log('[Electron] Node encontrado en:', candidate);
        return candidate;
      }
    } catch (_) {}
  }

  // Último recurso: confiar en PATH
  console.warn('[Electron] Node no encontrado en rutas conocidas. Se usará PATH del sistema.');
  return 'node';
}

// ─── Cargar el .env del backend manualmente ───────────────────────────────────
function loadBackendEnv() {
  const envPath = path.join(BACKEND_DIR, '.env');
  const env = {};
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (!isDev) {
      console.error('[Electron] FATAL: no se encontró .env del backend en', envPath);
      throw new Error(
        `Archivo de configuración (.env) no encontrado en:\n${envPath}\n\n` +
        `Reinstala la aplicación o contacta al administrador.`
      );
    }
    console.warn('[Electron] No se pudo leer .env del backend:', err.message);
    return env;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }

  // Validar variables críticas
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DEVICE_IP'];
  const missing = required.filter(k => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables críticas en .env del backend:\n  - ${missing.join('\n  - ')}\n\n` +
      `Verifica el archivo: ${envPath}`
    );
  }

  console.log('[Electron] .env del backend cargado correctamente desde:', envPath);
  return env;
}

// ─── Arrancar el backend Express ──────────────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    console.log('[Electron] Arrancando backend en:', BACKEND_DIR);

    let backendEnv;
    try {
      backendEnv = loadBackendEnv();
    } catch (envErr) {
      return reject(envErr);
    }

    const nodeBin = findNodeExecutable();

    const childEnv = {
      ...process.env,
      ...backendEnv,
      NODE_ENV: 'production',
      FRONTEND_DIST_PATH: FRONTEND_DIR,
      DATA_DIR: app.getPath('userData'),
      ELECTRON_RUN_AS_NODE: '1',
    };

    console.log('[Electron] Usando node:', nodeBin);

    try {
      backendProcess = spawn(nodeBin, ['index.js'], {
        cwd: BACKEND_DIR,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        // En Windows, si nodeBin es una ruta absoluta, NO usar shell (evita
        // que Windows interprete espacios en el path o caracteres especiales).
        shell: nodeBin === 'node',
        windowsHide: true,
      });
    } catch (spawnErr) {
      return reject(new Error(
        `No se pudo iniciar Node.js (${nodeBin}):\n${spawnErr.message}`
      ));
    }

    let backendStartError = null;
    let resolved = false;

    backendProcess.stdout.on('data', (data) => {
      const txt = data.toString().trim();
      console.log('[Backend]', txt);
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      console.error('[Backend Error]', msg);
      if (msg.includes('Error') || msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
        backendStartError = msg;
      }
    });

    backendProcess.on('error', (err) => {
      console.error('[Electron] No se pudo spawnar node:', err.message);
      if (!resolved) {
        resolved = true;
        reject(new Error(
          `No se pudo ejecutar Node.js.\n\nDetalle: ${err.message}\n\n` +
          `Asegúrate de tener Node.js instalado (https://nodejs.org).`
        ));
      }
    });

    backendProcess.on('exit', (code, signal) => {
      console.log('[Backend] Proceso terminado. Código:', code, 'Señal:', signal);
      if (!resolved && code !== 0 && code !== null && backendStartError) {
        resolved = true;
        reject(new Error(`El backend terminó con error:\n${backendStartError}`));
      } else if (!resolved && code !== 0 && code !== null) {
        resolved = true;
        reject(new Error(`El backend terminó inesperadamente (código ${code}).`));
      }
    });

    waitForBackend(BACKEND_PORT, 25000)
      .then(() => {
        if (!resolved) {
          resolved = true;
          backendReady = true;
          resolve();
        }
      })
      .catch((err) => {
        if (resolved) return;
        resolved = true;
        const detail = backendStartError
          ? `\n\nError del backend:\n${backendStartError}`
          : '\n\nVerifica que el puerto 5000 no esté ocupado.';
        reject(new Error(err.message + detail));
      });
  });
}

// ─── Sondear el backend hasta que responda ────────────────────────────────────
function waitForBackend(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function probe() {
      if (backendProcess && backendProcess.exitCode !== null) {
        reject(new Error(`El backend se cerró inesperadamente (código ${backendProcess.exitCode})`));
        return;
      }

      const req = http.get(`http://${BACKEND_HOST}:${port}/api/settings`, (res) => {
        res.resume();
        if (res.statusCode < 500) {
          console.log('[Electron] Backend listo ✓');
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', () => retry());
      req.setTimeout(800, () => { req.destroy(); retry(); });
    }

    function retry() {
      if (Date.now() - start > timeout) {
        reject(new Error(`El backend no respondió en ${timeout / 1000} segundos`));
        return;
      }
      setTimeout(probe, 600);
    }

    setTimeout(probe, 1500);
  });
}

// ─── Crear la ventana principal ───────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Evitar que el renderer navegue a URLs externas accidentalmente
      webSecurity: true,
    },
    icon: fs.existsSync(path.join(__dirname, 'icon.ico'))
      ? path.join(__dirname, 'icon.ico')
      : undefined,
    title: 'ZK-teco Asistencias',
    show: false,
    backgroundColor: '#0f172a',
  });

  mainWindow.loadURL(`http://${BACKEND_HOST}:${BACKEND_PORT}`);

  // Bloquear navegación a URLs fuera de localhost
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://${BACKEND_HOST}:${BACKEND_PORT}`) &&
        !url.startsWith(`http://localhost:${BACKEND_PORT}`)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // Bloquear apertura de nuevas ventanas (popups)
  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Permitir popups sin URL (window.open('', '', ...)) — usado por el
    // botón "Imprimir reporte" para abrir un documento imprimible.
    if (!url || url === 'about:blank' || frameName === 'report-print-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        }
      };
    }
    if (url.startsWith('https://wa.me/') || url.startsWith('https://web.whatsapp.com/')) {
      // WhatsApp se abre en el navegador del sistema, no en la app
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Menú de la aplicación ────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Recargar',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.webContents.reload()
        },
        {
          label: 'DevTools (Consola)',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Acerca de',
              message: 'Asistencias Galileo',
              detail: `Sistema de control de asistencia\nVersión ${APP_VERSION}\n\nElectron ${process.versions.electron}\nNode ${process.versions.node}\nChromium ${process.versions.chrome}`
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Ciclo de vida ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('[Electron] Error fatal:', err);
    dialog.showErrorBox('Error al iniciar Asistencias Galileo', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && backendReady) createWindow();
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('[Electron] Deteniendo backend...');
    try { backendProcess.kill(); } catch (_) {}
    backendProcess = null;
  }
});
