// preload.js
// Contexto aislado — expone APIs seguras al renderer mediante contextBridge.
'use strict';

const { contextBridge, shell } = require('electron');

// API expuesta al frontend como window.zkteco
contextBridge.exposeInMainWorld('zkteco', {
  // Abre una URL externa en el navegador predeterminado del sistema.
  // Esto se usa para WhatsApp Web y enlaces externos.
  openExternal: (url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return true;
    }
    return false;
  },
  // Info del entorno
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }
});
