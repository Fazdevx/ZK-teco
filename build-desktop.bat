@echo off
setlocal EnableDelayedExpansion

echo.
echo ============================================================
echo   ZK-teco Desktop Builder
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

:: Versión de Node.js portable a descargar (LTS con WebSocket nativo)
set "NODE_VERSION=22.18.0"
set "NODE_ZIP_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "NODE_ZIP=%DESKTOP_DIR%\node-portable.zip"

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

:: ── 1. Instalar dependencias del backend ─────────────────────────────────────
echo [1/6] Instalando dependencias del backend...
cd /d "%BACKEND_DIR%"
call npm install --omit=dev
if %errorlevel% neq 0 (
    echo [ERROR] Fallo npm install en el backend.
    pause
    exit /b 1
)
echo       OK

:: ── 2. Compilar el frontend ───────────────────────────────────────────────────
echo.
echo [2/6] Compilando el frontend (React + Vite)...
cd /d "%FRONTEND_DIR%"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Fallo npm install en el frontend.
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el build del frontend.
    pause
    exit /b 1
)
echo       OK

:: ── 3. Descargar Node.js portable ────────────────────────────────────────────
echo.
echo [3/6] Preparando Node.js portable...

if exist "%NODE_PORTABLE_DIR%\node.exe" (
    echo       Ya existe node portable en: %NODE_PORTABLE_DIR%
    echo       Omitiendo descarga.
) else (
    echo       Descargando Node.js v%NODE_VERSION% portable...
    echo       URL: %NODE_ZIP_URL%

    :: Usar PowerShell para descargar
    powershell -Command "Invoke-WebRequest -Uri '%NODE_ZIP_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing"
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo descargar Node.js portable.
        echo         Revisa tu conexion a internet.
        pause
        exit /b 1
    )

    echo       Extrayendo...
    if not exist "%NODE_PORTABLE_DIR%" mkdir "%NODE_PORTABLE_DIR%"

    :: Extraer solo node.exe y los .dll necesarios
    powershell -Command "& { Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead('%NODE_ZIP%'); foreach ($entry in $zip.Entries) { $name = $entry.Name; if ($name -eq 'node.exe' -or $name -match '\.dll$') { $dest = '%NODE_PORTABLE_DIR%\' + $name; [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true) } }; $zip.Dispose() }"
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo la extraccion de Node.js.
        pause
        exit /b 1
    )

    :: Limpiar el zip
    del "%NODE_ZIP%" >nul 2>&1

    if not exist "%NODE_PORTABLE_DIR%\node.exe" (
        echo [ERROR] node.exe no encontrado despues de extraer.
        pause
        exit /b 1
    )

    echo       node.exe listo en: %NODE_PORTABLE_DIR%
)
echo       OK

:: ── 4. Instalar dependencias de Electron ─────────────────────────────────────
echo.
echo [4/6] Instalando dependencias de Electron...
cd /d "%DESKTOP_DIR%"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Fallo npm install en zk-desktop.
    pause
    exit /b 1
)
echo       OK

:: ── 5. Empaquetar con electron-builder ───────────────────────────────────────
echo.
echo [5/6] Empaquetando con electron-builder...
echo       (Esto puede tardar varios minutos la primera vez)
cd /d "%DESKTOP_DIR%"
call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] Fallo electron-builder.
    pause
    exit /b 1
)
echo       OK

:: ── 6. Listo ──────────────────────────────────────────────────────────────────
echo.
echo [6/6] Listo!
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
