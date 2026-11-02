@echo off
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   ZK-teco Desktop Builder (sin descargar dependencias)
echo ============================================================
echo.

:: ── Directorio raíz del proyecto ─────────────────────────────────────────────
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

set "BACKEND_DIR=%ROOT%\zk-backend"
set "FRONTEND_DIR=%ROOT%\zk-frontend"
set "DESKTOP_DIR=%ROOT%\zk-desktop"
set "OUTPUT_DIR=%ROOT%\dist-desktop"
set "NODE_PORTABLE_DIR=%DESKTOP_DIR%\node-portable"

:: ── Verificar que node esté disponible para el build ─────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no encontrado en PATH.
    echo         Necesitas Node.js instalado para correr este script de build.
    echo         Descargalo en https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm no encontrado.
    pause
    exit /b 1
)

:: ── 1. Verificar dependencias del backend existen ─────────────────────────────
echo [1/4] Verificando dependencias del backend...
if not exist "%BACKEND_DIR%\node_modules" (
    echo [ERROR] No se encontro node_modules en el backend.
    echo         Ejecuta "npm install" en %BACKEND_DIR%
    echo         o usa build-desktop.bat para el build completo.
    pause
    exit /b 1
)
echo       OK

:: ── 2. Compilar el frontend ───────────────────────────────────────────────────
echo.
echo [2/4] Compilando el frontend (React + Vite)...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [ERROR] No se encontro node_modules en el frontend.
    echo         Ejecuta "npm install" en %FRONTEND_DIR%
    echo         o usa build-desktop.bat para el build completo.
    pause
    exit /b 1
)
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el build del frontend.
    pause
    exit /b 1
)
echo       OK

:: ── 3. Verificar Node.js portable (v22+ requerido para WebSocket nativo) ────────
echo.
echo [3/4] Verificando Node.js portable...
if not exist "%NODE_PORTABLE_DIR%\node.exe" (
    echo [ERROR] No se encontro node.exe en %NODE_PORTABLE_DIR%
    echo         Ejecuta build-desktop.bat una vez para descargarlo,
    echo         o coloca node.exe manualmente en esa carpeta.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('"%NODE_PORTABLE_DIR%\node.exe" --version') do set "NODE_VER=%%v"
echo       Node.js detectado: %NODE_VER%
REM Verificar que sea v22 o superior
for /f "tokens=1 delims=." %%a in ("%NODE_VER:v=%") do set "NODE_MAJOR=%%a"
if %NODE_MAJOR% LSS 22 (
    echo [ERROR] Se requiere Node.js 22+ para WebSocket nativo.
    echo         Version actual: %NODE_VER%
    echo         Borra la carpeta %NODE_PORTABLE_DIR% y ejecuta build-desktop.bat
    echo         para descargar Node.js 22.
    pause
    exit /b 1
)
echo       OK

:: ── 4. Empaquetar con electron-builder ────────────────────────────────────────
echo.
echo [4/4] Empaquetando con electron-builder...
echo       (Esto puede tardar varios minutos la primera vez)
if not exist "%DESKTOP_DIR%\node_modules" (
    echo [ERROR] No se encontro node_modules en zk-desktop.
    echo         Ejecuta "npm install" en %DESKTOP_DIR%
    echo         o usa build-desktop.bat para el build completo.
    pause
    exit /b 1
)
cd /d "%DESKTOP_DIR%"
call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] Fallo electron-builder.
    pause
    exit /b 1
)
echo       OK

:: ── Listo ─────────────────────────────────────────────────────────────────────
echo.
echo ============================================================
echo   Instalador generado en:
echo   %OUTPUT_DIR%
echo ============================================================
echo.

if exist "%OUTPUT_DIR%" (
    explorer "%OUTPUT_DIR%"
)

pause
