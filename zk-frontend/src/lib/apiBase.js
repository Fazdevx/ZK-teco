// Base de la API según el entorno:
// - Desktop (file://) y desarrollo local -> backend Express en :5000
// - Vercel / cualquier host web -> mismo origen, bajo /api
const configured = import.meta.env.VITE_API_URL;
const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
const isLocalHost = typeof window !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

export const API = configured
  || (isFile || import.meta.env.DEV || isLocalHost
    ? 'http://localhost:5000/api'
    : '/api');
