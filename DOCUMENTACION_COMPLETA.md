# ZK-teco — Sistema de Asistencia Biométrica
## Documentación Completa

**Versión:** 1.0.0  
**Fecha:** Agosto 2026  
**Lenguaje:** Español

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Configuración e Instalación](#configuración-e-instalación)
4. [Arquitectura](#arquitectura)
5. [API REST — Referencia Completa](#api-rest--referencia-completa)
6. [Funcionalidades del Backend](#funcionalidades-del-backend)
7. [Guía del Frontend](#guía-del-frontend)
8. [Flujos de Trabajo](#flujos-de-trabajo)
9. [Consideraciones Técnicas](#consideraciones-técnicas)
10. [Troubleshooting](#troubleshooting)

---

## Descripción General

**ZK-teco** es un sistema completo de asistencia y gestión de personal que integra:

- **Dispositivos ZKTeco**: Lectores biométricos de huella dactilar que registran entrada/salida
- **Backend Express.js**: Sincroniza datos del dispositivo con Supabase y expone API REST
- **Frontend React**: Interfaz web para visualizar asistencia, estadísticas y gestión de usuarios
- **Base de datos Supabase**: Almacenamiento PostgreSQL en la nube con autenticación y control de acceso

### Características principales

✓ Sincronización en tiempo real de registros biométricos  
✓ Cálculo automático de estado (puntual/retrasado)  
✓ Gestión de usuarios (crear, eliminar, captura de huella)  
✓ Reportes de asistencia (diarios, semanales, por usuario)  
✓ Dashboard con estadísticas y gráficos de tendencias  
✓ Configuración de reglas de horario y tolerancia  
✓ Auto-sincronización programada  

---

## Estructura del Proyecto

```
zk-teco/
├── .env                                # Variables de entorno (raíz, opcional)
├── AGENTS.md                           # Resumen de agentes (interno)
├── DOCUMENTACION_COMPLETA.md           # Este archivo
│
├── zk-backend/                         # API Express.js (Puerto 5000)
│   ├── index.js                        # Servidor principal
│   ├── package.json                    # Dependencias del backend
│   ├── settings.json                   # Configuración de reglas (se genera automáticamente)
│   ├── incidents.json                  # Incidentes (se genera automáticamente)
│   ├── .env                            # Variables de entorno del dispositivo
│   └── scripts/
│       ├── extract-today.js            # CLI: extraer registros de hoy
│       └── unlock-admin.js             # CLI: desbloquear administrador
│
└── zk-frontend/                        # SPA React (Puerto 5173 en dev)
    ├── src/
    │   ├── main.jsx                    # Punto de entrada React
    │   ├── App.jsx                     # Router, layout, barra global
    │   ├── Dashboard.jsx               # Estadísticas y resumen
    │   ├── Attendance.jsx              # Tabla de registros
    │   ├── Users.jsx                   # Gestión de usuarios
    │   ├── Settings.jsx                # Configuración de reglas
    │   ├── index.css                   # Estilos Tailwind v4 + personalizados
    │   └── lib/
    │       └── supabaseClient.js       # Cliente Supabase
    ├── vite.config.js                  # Configuración Vite + React
    ├── eslint.config.js                # Configuración ESLint v9
    ├── package.json                    # Dependencias del frontend
    ├── .env                            # Variables de entorno del frontend
    └── index.html                      # HTML principal
```

---

## Configuración e Instalación

### Requisitos previos

- Node.js ≥ 18.0.0
- npm o yarn
- Acceso a una base de datos Supabase
- Dispositivo ZKTeco conectado en la red (IP y puerto configurables)

### Variables de Entorno

#### Backend (`zk-backend/.env`)

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Dispositivo ZKTeco
DEVICE_IP=192.168.0.201
DEVICE_PORT=4370
DEVICE_PASSWORD=0

# Servidor (opcional)
PORT=5000
```

#### Frontend (`zk-frontend/.env`)

```env
# URL de la API del backend
VITE_API_URL=http://localhost:5000/api

# Supabase (anon key para lectura, service role NO debe usarse en el cliente)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Instalación paso a paso

#### 1. Clonar el repositorio

```bash
cd C:\Users\fabri\Downloads\Projcts\ZK-teco
```

#### 2. Instalar dependencias del backend

```bash
cd zk-backend
npm install
```

#### 3. Instalar dependencias del frontend

```bash
cd ../zk-frontend
npm install
```

#### 4. Configurar variables de entorno

- Editar `zk-backend/.env` con credenciales Supabase y datos del dispositivo
- Editar `zk-frontend/.env` con URLs de API y Supabase

#### 5. Iniciar el backend

```bash
cd zk-backend
npm run dev  # Con auto-reload (recomendado para desarrollo)
# o
npm start    # Ejecución normal
```

El servidor estará disponible en `http://localhost:5000`

#### 6. Iniciar el frontend (en otra terminal)

```bash
cd zk-frontend
npm run dev  # Vite dev server con HMR
```

El frontend estará disponible en `http://localhost:5173`

---

## Arquitectura

### Diagrama de Flujo de Datos

```
┌─────────────────────┐
│  Dispositivo ZKTeco │
│  (IP: 192.168.0.201)│
└──────────┬──────────┘
           │
           │ zklib-ng
           │
      ┌────▼────────────────────────┐
      │   Backend Express.js         │
      │   (Puerto 5000)              │
      │                              │
      │  • /api/settings             │
      │  • /api/sync/*               │
      │  • /api/data/*               │
      │  • /api/device/*             │
      └────┬──────────────┬──────────┘
           │              │
           │ Supabase SDK │
           │ Service Role │
           │              │
      ┌────▼──────────────┴──┐
      │  Supabase PostgreSQL │
      │                      │
      │  • users             │
      │  • attendance_logs   │
      │  • settings          │
      └──────────────────────┘


┌──────────────────────────┐
│   Frontend React SPA     │
│   (Vite Dev / Build)     │
│                          │
│  ├─ Dashboard            │
│  ├─ Attendance           │
│  ├─ Users                │
│  ├─ Settings             │
│  └─ App.jsx (Router)     │
└────┬─────────────────────┘
     │
     │ fetch(VITE_API_URL)
     │
     └─► http://localhost:5000/api/*
```

### Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Dispositivo** | ZKTeco + zklib-ng | 0.1.8 |
| **Backend** | Express.js + Node.js | 5.2.1 |
| **Frontend** | React + Vite | 19.2.8 + 8.2.0 |
| **Estilos** | Tailwind CSS | 4.3.3 |
| **Base de datos** | Supabase (PostgreSQL) | 2.112.3 |
| **Desarrollo** | Nodemon, ESLint | 3.1.14, 10.8.0 |

---

## API REST — Referencia Completa

### Base URL

```
http://localhost:5000/api
```

### Convenciones

Todas las respuestas siguen el formato de envolvente estándar:

```json
{
  "success": true,
  "data": { },
  "message": "Operación exitosa",
  "count": 5
}
```

Códigos de estado HTTP:
- `200 OK`: Éxito
- `400 Bad Request`: Parámetros inválidos
- `500 Internal Server Error`: Error del servidor

---

### 1. CONFIGURACIÓN (Settings)

#### GET `/settings`

**Descripción**: Obtiene la configuración actual de reglas de horario y tolerancia.

**Parámetros**: Ninguno

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "lateHour": 8,
    "lateMinute": 0,
    "workStartHour": 8,
    "workStartMinute": 0,
    "workEndHour": 17,
    "workEndMinute": 0,
    "toleranceMinutes": 0,
    "autoSync": false,
    "autoSyncInterval": 5
  }
}
```

**Campos**:
- `lateHour`, `lateMinute`: Hora en que se marca como "retrasado"
- `workStartHour/Minute`: Inicio de jornada laboral
- `workEndHour/Minute`: Fin de jornada laboral
- `toleranceMinutes`: Minutos de tolerancia antes de marcar como retrasado
- `autoSync`: Activar sincronización automática
- `autoSyncInterval`: Intervalo en minutos para auto-sync

**Ejemplo**:
```bash
curl http://localhost:5000/api/settings
```

---

#### POST `/settings`

**Descripción**: Actualiza la configuración de reglas. Solo proporciona los campos a cambiar.

**Body**:
```json
{
  "lateHour": 9,
  "toleranceMinutes": 15,
  "autoSync": true,
  "autoSyncInterval": 10
}
```

**Respuesta**: Retorna el objeto de configuración completo después de la actualización.

**Notas**:
- Los cambios se persisten en `settings.json` en el disco
- Si `autoSync` cambia a `true`, se reinicia el timer de sincronización
- Los cambios en settings son locales al servidor (no se sincronizan a Supabase)

**Ejemplo**:
```bash
curl -X POST http://localhost:5000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"lateHour": 9, "toleranceMinutes": 15}'
```

---

### 2. SINCRONIZACIÓN (Sync)

#### POST `/sync/users`

**Descripción**: Descarga la lista de usuarios desde el dispositivo ZKTeco y la sincroniza a Supabase.

**Parámetros**: Ninguno

**Body**: Vacío (o `{}`)

**Respuesta**:
```json
{
  "success": true,
  "count": 25,
  "data": [
    {
      "id": 1,
      "name": "Juan Pérez",
      "card_number": "12345678"
    },
    {
      "id": 2,
      "name": "María García",
      "card_number": null
    }
  ]
}
```

**Errores comunes**:
- `"Error: Connection refused"`: El dispositivo no está reachable (verificar IP/puerto)
- `"Error: Timeout"`: El dispositivo tarda en responder (aumentar `timeoutMs` en `connectToDevice`)

**Notas**:
- Invalida la caché local de usuarios
- Usa `onConflict: 'id'` para actualizar usuarios existentes
- Los usuarios sin nombre reciben un nombre por defecto

**Ejemplo**:
```bash
curl -X POST http://localhost:5000/api/sync/users \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

#### POST `/sync/attendance`

**Descripción**: Descarga usuarios y registros de asistencia desde el dispositivo. Es la operación más completa.

**Parámetros**: Ninguno

**Body**: Vacío (o `{}`)

**Respuesta**:
```json
{
  "success": true,
  "count": 1250,
  "message": "1250 registros de asistencia sincronizados"
}
```

**Proceso interno**:
1. Conecta al dispositivo ZKTeco
2. Descarga lista de usuarios y los upsertea a Supabase
3. Descarga registros de asistencia (con timestamp)
4. Filtra registros de usuarios válidos
5. Inserta en chunks de 500 para evitar timeouts
6. Desconecta del dispositivo

**Notas**:
- Esta es la operación más pesada (puede tardar varios minutos con muchos registros)
- Los registros se deduplicaban con `onConflict: 'user_id, check_time'`
- Los dispositivos ZKTeco tienen un timestamp unix que se convierte a ISO-8601

**Ejemplo**:
```bash
curl -X POST http://localhost:5000/api/sync/attendance \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 3. DATOS — ASISTENCIA (Data: Attendance)

#### GET `/data/attendance?filter=today|week|all`

**Descripción**: Obtiene registros de asistencia con enriquecimiento de tipos de punche y estado.

**Parámetros de query**:
| Parámetro | Valores | Default | Descripción |
|-----------|---------|---------|-------------|
| `filter` | `today`, `week`, `all` | `today` | Rango temporal |

**Respuesta**:
```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "id": "uuid-1234",
      "user_id": 5,
      "user_name": "Carlos López",
      "check_time": "2026-08-24T08:30:00Z",
      "punch_type": "entry",
      "status": "on-time",
      "date": "2026-08-24"
    },
    {
      "id": "uuid-5678",
      "user_id": 5,
      "user_name": "Carlos López",
      "check_time": "2026-08-24T17:15:00Z",
      "punch_type": "exit",
      "status": "on-time",
      "date": "2026-08-24"
    }
  ]
}
```

**Campos**:
- `punch_type`: `"entry"` (entrada) o `"exit"` (salida)
- `status`: `"on-time"` (puntual) o `"late"` (retrasado)
- `date`: Fecha en formato YYYY-MM-DD

**Filtros temporales**:
- `today`: Últimas 24 horas desde la medianoche local
- `week`: Últimos 7 días desde medianoche
- `all`: Todos los registros disponibles

**Notas**:
- El tipo de punche se calcula con `getPunchType()` (heurística: antes de mediodía = entrada, después = salida)
- El estado se compara con `lateHour:lateMinute + toleranceMinutes` de settings
- Solo considera el primer registro del día para el status (para gráficos)

**Ejemplo**:
```bash
curl "http://localhost:5000/api/data/attendance?filter=today"
curl "http://localhost:5000/api/data/attendance?filter=week"
```

---

### 4. DATOS — USUARIOS (Data: Users)

#### GET `/data/users`

**Descripción**: Obtiene la lista completa de usuarios con caché de 5 minutos.

**Parámetros**: Ninguno

**Respuesta**:
```json
{
  "success": true,
  "count": 25,
  "data": [
    { "id": 1, "name": "Juan Pérez" },
    { "id": 2, "name": "María García" },
    { "id": 5, "name": "Carlos López" }
  ]
}
```

**Notas**:
- Usa caché de 5 minutos (TTL) para reducir carga en Supabase
- La caché se invalida automáticamente después de `/sync/users` o `/sync/attendance`
- Los datos están ordenados alfabéticamente por nombre

**Ejemplo**:
```bash
curl http://localhost:5000/api/data/users
```

---

#### GET `/data/users/:id/detail`

**Descripción**: Obtiene estadísticas y resumen diario de un usuario específico.

**Parámetros de ruta**:
- `id` (number): ID del usuario

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "user": { "id": 5, "name": "Carlos López" },
    "stats": {
      "totalChecks": 120,
      "daysWithLate": 8,
      "daysWorked": 20,
      "averageHours": 8.5
    },
    "daySummaries": [
      {
        "date": "2026-08-24",
        "checkIn": "2026-08-24T08:30:00Z",
        "checkInType": "entry",
        "checkOut": "2026-08-24T17:15:00Z",
        "checkOutType": "exit",
        "totalChecks": 2,
        "status": "on-time",
        "hoursWorked": 8.8
      },
      {
        "date": "2026-08-23",
        "checkIn": "2026-08-23T08:45:00Z",
        "checkInType": "entry",
        "checkOut": null,
        "checkOutType": null,
        "totalChecks": 1,
        "status": "late",
        "hoursWorked": null
      }
    ]
  }
}
```

**Campos**:
- `stats.totalChecks`: Cantidad total de punches (entrada + salida)
- `stats.daysWithLate`: Cuántos días el usuario llegó tarde
- `stats.daysWorked`: Cuántos días tiene registros
- `stats.averageHours`: Promedio de horas trabajadas por día

**Notas**:
- `hoursWorked` es null si solo hay 1 punche en el día (sin salida)
- `checkOut` es null si no hay salida registrada
- Los días están ordenados más recientes primero

**Ejemplo**:
```bash
curl http://localhost:5000/api/data/users/5/detail
```

---

### 5. DASHBOARD

#### GET `/data/dashboard`

**Descripción**: Obtiene un resumen ejecutivo para la página de inicio.

**Parámetros**: Ninguno

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "todayStats": {
      "totalPresent": 18,
      "totalAbsent": 7,
      "totalLate": 3,
      "onTime": 15
    },
    "weeklyTrend": [
      { "date": "2026-08-18", "present": 20, "absent": 5, "late": 2 },
      { "date": "2026-08-19", "present": 19, "absent": 6, "late": 3 },
      { "date": "2026-08-20", "present": 21, "absent": 4, "late": 1 },
      { "date": "2026-08-21", "present": 20, "absent": 5, "late": 2 },
      { "date": "2026-08-22", "present": 18, "absent": 7, "late": 4 },
      { "date": "2026-08-23", "present": 19, "absent": 6, "late": 2 },
      { "date": "2026-08-24", "present": 18, "absent": 7, "late": 3 }
    ],
    "lateUsers": [
      { "id": 5, "name": "Carlos López", "checkTime": "2026-08-24T08:45:00Z" },
      { "id": 12, "name": "Rosa Martínez", "checkTime": "2026-08-24T08:50:00Z" },
      { "id": 18, "name": "Diego Fernández", "checkTime": "2026-08-24T09:00:00Z" }
    ],
    "earlyLeaveUsers": [
      { "id": 8, "name": "Patricia Silva", "checkOutTime": "2026-08-24T15:30:00Z" },
      { "id": 14, "name": "Manuel Torres", "checkOutTime": "2026-08-24T16:00:00Z" }
    ]
  }
}
```

**Campos**:
- `todayStats`: Resumen del día actual (presente/ausente/retrasado/puntual)
- `weeklyTrend`: Datos de los últimos 7 días para gráficos
- `lateUsers`: Usuarios que llegaron tarde hoy
- `earlyLeaveUsers`: Usuarios que salieron temprano (antes de `workEndHour`)

**Notas**:
- Se calcula dinámicamente basado en settings
- "Ausente" significa no hay punches en el día
- "Presente" significa al menos 1 punche en el día

**Ejemplo**:
```bash
curl http://localhost:5000/api/data/dashboard
```

---

### 6. REPORTES

#### GET `/data/report?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=N`

**Descripción**: Genera un reporte de asistencia por usuario en un rango de fechas (para impresión).

**Parámetros de query**:
| Parámetro | Tipo | Requerido | Ejemplo |
|-----------|------|-----------|---------|
| `from` | string (YYYY-MM-DD) | Sí | `2026-08-01` |
| `to` | string (YYYY-MM-DD) | Sí | `2026-08-31` |
| `userId` | number | No | `5` |

**Respuesta** (sin userId):
```json
{
  "success": true,
  "count": 22,
  "data": [
    {
      "date": "2026-08-24",
      "checkIn": "08:30",
      "checkOut": "17:15",
      "hoursWorked": 8.8,
      "status": "on-time"
    },
    {
      "date": "2026-08-23",
      "checkIn": "08:45",
      "checkOut": null,
      "hoursWorked": null,
      "status": "late"
    }
  ]
}
```

**Respuesta** (con userId):
```json
{
  "success": true,
  "data": {
    "user": { "id": 5, "name": "Carlos López" },
    "reportDate": "2026-08-24",
    "period": "2026-08-01 a 2026-08-31",
    "summaries": [
      {
        "date": "2026-08-24",
        "checkIn": "08:30",
        "checkOut": "17:15",
        "hoursWorked": 8.8,
        "status": "on-time"
      }
    ],
    "totalDays": 22,
    "totalPresent": 20,
    "totalAbsent": 2,
    "totalLate": 1,
    "totalHours": 176.5
  }
}
```

**Notas**:
- Los tiempos se formatean como HH:MM (local)
- Si no hay salida, `checkOut` es null
- Perfecto para generar reportes PDF o imprimibles
- Las ausencias son días sin ningún punche

**Ejemplo**:
```bash
curl "http://localhost:5000/api/data/report?from=2026-08-01&to=2026-08-31&userId=5"
curl "http://localhost:5000/api/data/report?from=2026-08-24&to=2026-08-24"
```

---

### 7. DISPOSITIVO (Device)

#### POST `/device/users`

**Descripción**: Crea un nuevo usuario directamente en el dispositivo ZKTeco.

**Body**:
```json
{
  "userId": 50,
  "name": "Nuevo Usuario"
}
```

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "userId": 50,
    "name": "Nuevo Usuario"
  },
  "message": "Usuario creado en el dispositivo"
}
```

**Notas**:
- El usuario se crea **solo en el dispositivo**, no en Supabase
- Debe ser un `userId` único que no exista en el dispositivo
- Después de crear, es necesario ejecutar `/sync/users` para traer el usuario a Supabase
- El usuario debe existir en el dispositivo antes de enrollar huella

**Ejemplo**:
```bash
curl -X POST http://localhost:5000/api/device/users \
  -H "Content-Type: application/json" \
  -d '{"userId": 50, "name": "Pedro González"}'
```

---

#### DELETE `/device/users/:id`

**Descripción**: Elimina un usuario del dispositivo y de la base de datos.

**Parámetros de ruta**:
- `id` (number): ID del usuario

**Respuesta**:
```json
{
  "success": true,
  "message": "Usuario 50 eliminado del dispositivo y Supabase"
}
```

**Proceso**:
1. Conecta al dispositivo ZKTeco
2. Elimina el usuario del dispositivo
3. Elimina el usuario y sus registros de Supabase (cascada)
4. Desconecta

**Advertencia ⚠️**:
- **Esta operación es destructiva**: Elimina toda la historia de asistencia del usuario
- No se puede deshacer sin restaurar desde backup

**Ejemplo**:
```bash
curl -X DELETE http://localhost:5000/api/device/users/50
```

---

#### POST `/device/enroll`

**Descripción**: Inicia el proceso de captura de huella dactilar para un usuario existente.

**Body**:
```json
{
  "userId": 5,
  "fingerId": 1
}
```

**Respuesta** (después de que el usuario presione 3 veces):
```json
{
  "success": true,
  "message": "Huella capturada exitosamente para usuario 5"
}
```

**Proceso**:
1. El usuario debe presionar su dedo en el lector **3 veces**
2. El dispositivo captura la huella en cada presa
3. El endpoint **bloquea hasta completar o timeout** (~30 segundos)
4. Supabase se actualiza con la huella capturada

**Notas**:
- El usuario **debe existir en el dispositivo** antes de enrollar
- `fingerId` puede omitirse (default 1)
- El endpoint es síncrono y bloqueante
- Para producción, considerar convertir a operación asíncrona con webhook

**Ejemplo**:
```bash
curl -X POST http://localhost:5000/api/device/enroll \
  -H "Content-Type: application/json" \
  -d '{"userId": 5, "fingerId": 1}'
```

---

## Funcionalidades del Backend

### 1. Gestión de Caché de Usuarios

El backend mantiene un caché en memoria de usuarios con TTL de 5 minutos:

```javascript
const userCache = {
  data: null,
  lastFetch: 0,
  ttl: 5 * 60 * 1000,
  
  async get() { /* ... */ },
  invalidate() { /* ... */ },
  getMap() { /* ... */ }
};
```

**Beneficios**:
- Reduce consultas a Supabase
- Acelera respuestas de endpoints que necesitan mapear IDs a nombres
- Se invalida automáticamente después de sincronizaciones

---

### 2. Cálculo de Tipo de Punche (Entrada/Salida)

Dos funciones complementarias:

#### `getPunchType(date)` — Heurística simple

```javascript
function getPunchType(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h < 12 || (h === 12 && m === 0)) ? 'entry' : 'exit';
}
```

- Regla: Antes de mediodía = entrada, después de mediodía = salida
- ⚠️ **Problema**: No funciona con turnos nocturnos que cruzan medianoche

#### `getSmartPunchType(userDayLogs, currentLogIndex)` — Inteligente

```javascript
function getSmartPunchType(userDayLogs, currentLogIndex) {
  // Primer punche = entrada
  // Último punche (si hay múltiples) = salida
  // Intermedios = decidir por contexto y hora
}
```

- Considera el contexto del día completo
- Detecta si hay punches de mañana antes de los punches de tarde
- **Recomendación**: Usar `getSmartPunchType` en futuros cálculos

---

### 3. Cálculo de Estado (Puntual/Retrasado)

```javascript
function getStatus(date, settings) {
  const h = date.getHours();
  const m = date.getMinutes();
  const lateTotal = settings.lateHour * 60 + 
                    settings.lateMinute + 
                    settings.toleranceMinutes;
  return (h * 60 + m) <= lateTotal ? 'on-time' : 'late';
}
```

**Lógica**:
1. Convierte `lateHour:lateMinute + toleranceMinutes` a minutos
2. Compara minutos totales del primer punche del día
3. Si es ≤ la hora límite, es "puntual"; si no, "retrasado"

**Ejemplo**:
- Si `lateHour=8, lateMinute=0, tolerance=15`
- Límite = 8:15 AM
- Un punche a las 8:10 AM = "on-time"
- Un punche a las 8:20 AM = "late"

---

### 4. Sincronización Automática

El backend puede ejecutar sincronización periódica sin intervención manual:

```javascript
function restartAutoSync(settings) {
  if (syncTimer) clearInterval(syncTimer);
  if (settings.autoSync && settings.autoSyncInterval > 0) {
    syncTimer = setInterval(runSync, settings.autoSyncInterval * 60 * 1000);
    runSync(); // Ejecutar inmediatamente
  }
}
```

**Configuración en settings**:
```json
{
  "autoSync": true,
  "autoSyncInterval": 5
}
```

Esto sincroniza cada 5 minutos automáticamente.

**Casos de uso**:
- Ambientes de producción sin UI
- Sincronización periódica para mantener datos frescos
- Respaldo de sincronización manual

---

### 5. Resúmenes Diarios

La función `buildDaySummaries()` transforma logs en bruto a resúmenes por día:

**Input** (logs crudos):
```
ID 5: 08:30, 12:00, 17:15  (3 punches en el día)
ID 5: 08:45  (1 punche en el día)
```

**Output** (resúmenes):
```javascript
[
  {
    date: "2026-08-24",
    checkIn: "2026-08-24T08:30:00Z",
    checkInType: "entry",
    checkOut: "2026-08-24T17:15:00Z",  // Toma el último
    checkOutType: "exit",
    totalChecks: 3,
    status: "on-time",
    hoursWorked: 8.75
  },
  {
    date: "2026-08-23",
    checkIn: "2026-08-23T08:45:00Z",
    checkInType: "entry",
    checkOut: null,  // Sin salida
    checkOutType: null,
    totalChecks: 1,
    status: "late",
    hoursWorked: null
  }
]
```

**Notas**:
- ⚠️ Ignora punches intermedios (ej: salida a comida)
- Asume primer punche = entrada, último = salida
- `hoursWorked` es null si solo 1 punche

---

### 6. Manejo de Conexión con ZKTeco

Patrón seguro de conexión/desconexión:

```javascript
function connectToDevice() {
  return new ZKDevice({
    host: process.env.DEVICE_IP || '192.168.0.201',
    port: parseInt(process.env.DEVICE_PORT) || 4370,
    password: parseInt(process.env.DEVICE_PASSWORD) || 0,
    timeoutMs: 10000
  });
}

// En endpoints:
const device = connectToDevice();
try {
  await device.connect();
  // Operaciones...
  await device.disconnect();
} catch (err) {
  if (device.session) {
    try { await device.disconnect(); } catch {}
  }
  // Manejo de error
}
```

**Garantías**:
- Siempre desconecta, incluso si hay error
- Timeout de 10 segundos para evitar cuelgues indefinidos
- Contraseña del dispositivo configurable

---

## Guía del Frontend

### 1. Estructura de Componentes

```
App.jsx (Router, Layout)
├── Dashboard.jsx          → Estadísticas y resumen
├── Attendance.jsx         → Tabla de registros con filtros
├── Users.jsx              → Lista de usuarios + detalles
└── Settings.jsx           → Configuración de reglas
```

### 2. Componente Principal: App.jsx

**Responsabilidades**:
- Router de React (client-side)
- Barra lateral con navegación
- Botón de sincronización global (en header)
- Manejo de errores/mensajes globales
- Gestión de estado de error y éxito

**Props compartidas** (pasadas a páginas):
- `setError(msg)` — Muestra error en la barra superior
- `setSuccess(msg)` — Muestra mensaje de éxito
- `onSync()` — Callback al hacer clic en botón de sincronización

### 3. Página: Dashboard

**Funcionalidades**:
- Tarjetas de estadísticas (presente/ausente/retrasado/puntual)
- Gráfico de tendencia semanal
- Lista de usuarios retrasados hoy
- Lista de usuarios que salieron temprano

**Props**:
- `setError`
- `setSuccess`
- `onSync` — Pasado como callback en el sidebar

**Hook de efecto**:
```javascript
useEffect(() => {
  fetch(`${VITE_API_URL}/data/dashboard`)
    .then(res => res.json())
    .then(data => setData(data.data))
    .catch(err => setError(err.message));
}, []);
```

**⚠️ Gotcha**: No re-fetches cuando cambia la lista de usuarios (stale data).

### 4. Página: Attendance

**Funcionalidades**:
- Tabla de registros de asistencia
- Filtros: Hoy / Última semana / Todo
- Muestra: User, Check Time, Tipo Punche, Status

**Filtros**:
- `today` — Últimas 24 horas
- `week` — Últimos 7 días
- `all` — Todos los registros

**UI**:
- Tailwind CSS v4 con gradientes personalizados
- Spinner durante carga
- "Sin datos" si resultado vacío

### 5. Página: Users

**Funcionalidades**:
- Lista de todos los usuarios
- Click en usuario abre panel de detalles
- Detalle muestra: Estadísticas, resumen diario, horas trabajadas
- Botón para crear nuevo usuario (si lo hay)

**Integración con API**:
```javascript
GET /data/users                    // Lista de usuarios
GET /data/users/:id/detail         // Detalles de 1 usuario
POST /device/users                 // Crear usuario en dispositivo
DELETE /device/users/:id           // Eliminar usuario
POST /device/enroll                // Capturar huella
```

### 6. Página: Settings

**Funcionalidades**:
- Formulario para configurar horas de trabajo
- Campos: lateHour, lateMinute, toleranceMinutes, workStart, workEnd
- Toggle para auto-sync
- Guardar cambios a backend

**Endpoint**:
```javascript
GET /api/settings   // Cargar valores actuales
POST /api/settings  // Guardar cambios
```

---

### 7. Estilos: Tailwind CSS v4 + Personalizaciones

**Archivo**: `src/index.css`

**Características**:
- Directiva `@import "tailwindcss"` (sintaxis v4, no v3)
- Font Inter (@fontsource/inter, pesos 400-800)
- Gradientes personalizados (`.gradient-blue`, `.gradient-green`, etc.)
- Animaciones (`.animate-fade-in`, `.animate-slide-up`)

**Ejemplo de gradiente personalizado**:
```css
.gradient-blue {
  @apply bg-gradient-to-r from-blue-500 to-cyan-500;
}
```

**Uso en JSX**:
```jsx
<div className="gradient-blue text-white p-8 rounded-lg">
  Contenido
</div>
```

---

### 8. Cliente Supabase

**Archivo**: `src/lib/supabaseClient.js`

**Nota**: El cliente está configurado pero **no se usa** en los componentes actuales.
- Se obtienen datos vía API (`fetch(VITE_API_URL)`)
- No hay consultas directas a Supabase desde el frontend

**Razón**: El backend es intermediario, lo que:
- ✅ Centraliza lógica de negocio
- ✅ Facilita auditoría y logs
- ✅ Evita exponer service role key

---

### 9. ESLint Plano (v9)

**Archivo**: `eslint.config.js`

**Configuración**:
```javascript
import jsConfig from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';

export default [
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }
    },
    rules: { ...jsConfig.configs.recommended.rules, ... }
  }
];
```

**Uso**:
```bash
npm run lint                 # Verificar
npm run lint -- --fix       # Autocorregir
```

---

## Flujos de Trabajo

### Flujo 1: Registrar Nuevo Usuario

```
1. Admin accede a Users → "+ Nuevo Usuario"
2. Ingresa ID y nombre
3. Frontend hace POST /api/device/users
4. Usuario se crea en dispositivo ZKTeco
5. Admin hace "Sincronizar usuarios"
6. Backend sincroniza del dispositivo a Supabase
7. Usuario aparece en lista del frontend
8. Admin click en usuario + "Capturar huella"
9. Usuario presiona dedo 3 veces en lector
10. Backend confirma huella capturada
```

### Flujo 2: Sincronización Manual

```
1. Admin presiona botón "Sincronizar" en App.jsx header
2. Frontend hace POST /api/sync/attendance
3. Backend:
   a. Conecta a dispositivo
   b. Descarga usuarios
   c. Upsertea usuarios a Supabase
   d. Descarga registros de asistencia
   e. Upsertea registros en chunks de 500
   f. Desconecta
4. Frontend recibe confirmación + count
5. Dashboard se recarga automáticamente
6. Nuevo mensaje de éxito en barra superior
```

### Flujo 3: Sincronización Automática

```
1. Admin configura Settings: autoSync=true, autoSyncInterval=5
2. Backend inicia timer: setInterval(runSync, 5*60*1000)
3. Cada 5 minutos, backend ejecuta runSync() sin intervención
4. Logs de consola muestran progreso
5. Si hay error, se loguea pero no interrumpe el timer
6. Al cambiar settings, se reinicia el timer (puede ser 0 para detener)
```

### Flujo 4: Generar Reporte

```
1. Admin selecciona usuario y rango de fechas en Users detail
2. Frontend hace GET /api/data/report?from=...&to=...&userId=N
3. Backend calcula resúmenes diarios para ese usuario
4. Frontend muestra tabla de resumen (o genera PDF con librería externa)
5. Admin puede imprimir o exportar
```

---

## Consideraciones Técnicas

### 1. Limitaciones Conocidas

| Limitación | Impacto | Workaround |
|-----------|---------|-----------|
| Heurística de entrada/salida usa mediodía | No soporta turnos nocturnos | Mejorar `getSmartPunchType()` |
| Ignora punches intermedios (comida) | Horas trabajadas imprecisas | Considerar rangos de comida en settings |
| Settings solo en servidor | No se sincronizan a equipos | Replicar settings en BD o API |
| Endpoint `/device/enroll` es bloqueante | UI se cuelga durante captura | Convertir a async con webhook |
| Caché de usuarios no se actualiza | Stale data en Dashboard | Re-fetch manual o websockets |

### 2. Seguridad

⚠️ **Problemas actuales**:

1. **Service Role Key en frontend** (`zk-frontend/.env`)
   - ✅ No se usa en código actual, pero está expuesta en bundle
   - 🔧 **Fix**: Remover de `.env` del frontend, usarla solo en backend

2. **CORS habilitado sin restricciones**
   ```javascript
   app.use(cors());  // Todos los orígenes permtidos
   ```
   - 🔧 **Fix**: Limitar a origen del frontend:
   ```javascript
   app.use(cors({ origin: 'http://localhost:5173' }));
   ```

3. **Sin autenticación en endpoints**
   - Cualquier cliente puede sincronizar o cambiar settings
   - 🔧 **Fix**: Agregar JWT o token de API

4. **Logs en consola exponen IPs de dispositivos**
   - 🔧 **Fix**: Usar logger estructurado (winston, pino)

### 3. Performance

**Optimizaciones presentes**:
- ✅ Caché de usuarios (TTL 5 min)
- ✅ Batch upsert en chunks de 500
- ✅ Índices implícitos en Supabase (user_id, check_time)

**Mejoras sugeridas**:
1. Paginación en `/data/attendance` (limit/offset)
2. Compresión gzip en responses
3. Índices compostos en Supabase (user_id, check_time)
4. Background job para `/device/enroll` (no bloquear endpoint)
5. Caché de `/data/dashboard` en Redis

### 4. Mantenibilidad

**Código limpio**:
- ✅ Funciones pequeñas y bien nombradas
- ✅ Comentarios en secciones clave
- ✅ Manejo de errores centralizado

**Mejoras recomendadas**:
1. Agregar tests unitarios (actualmente no hay)
2. TypeScript opcional (TS enums para status, punch_type)
3. Documentación de modelos de datos
4. CI/CD pipeline (GitHub Actions, etc.)

---

## Troubleshooting

### Problema: "Connection refused" al sincronizar

**Causa**: El dispositivo ZKTeco no está disponible en la red.

**Solución**:
```bash
# 1. Verificar IP del dispositivo
ping 192.168.0.201

# 2. Si no responde, verificar con el panel de administración del dispositivo
# 3. Confirmar IP y puerto en .env:
DEVICE_IP=192.168.0.201
DEVICE_PORT=4370

# 4. Reiniciar backend
npm run dev
```

---

### Problema: "Timeout" en `/sync/attendance`

**Causa**: El dispositivo tarda mucho en responder (muchos registros).

**Solución**:
1. Aumentar `timeoutMs` en `connectToDevice()`:
   ```javascript
   timeoutMs: 30000  // 30 segundos en lugar de 10
   ```
2. Ejecutar sync en horas de bajo uso
3. Limitar rango de fechas en el dispositivo manualmente antes de sync

---

### Problema: Usuario se crea en dispositivo pero no aparece en frontend

**Causa**: Usuario en dispositivo pero no sincronizado a Supabase.

**Solución**:
```bash
# Ejecutar sincronización manual
curl -X POST http://localhost:5000/api/sync/users -H "Content-Type: application/json" -d '{}'

# O desde UI: Dashboard → Botón "Sincronizar"
```

---

### Problema: Service Role Key no encontrada (error 401)

**Causa**: `SUPABASE_SERVICE_ROLE_KEY` no está en `zk-backend/.env`.

**Solución**:
```bash
# 1. Obtener key de Supabase Dashboard → Settings → API
# 2. Copiar a zk-backend/.env:
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 3. Reiniciar backend
npm run dev
```

---

### Problema: Frontend obtiene 404 en `http://localhost:5000/api/*`

**Causa**: Backend no está corriendo o API URL es incorrecta.

**Solución**:
```bash
# 1. Verificar backend ejecutándose
curl http://localhost:5000/api/settings

# 2. Si 404, verificar zk-frontend/.env:
VITE_API_URL=http://localhost:5000/api

# 3. Limpiar caché Vite:
npm run dev  # Reconstruir

# 4. Reiniciar frontend
```

---

### Problema: "No se puede capturar huella" en enroll

**Causas posibles**:
- Usuario no existe en dispositivo
- Tiempo de timeout expiró
- Problema de hardware del lector

**Solución**:
```bash
# 1. Verificar usuario existe:
curl http://localhost:5000/api/data/users

# 2. Si no existe, crear primero:
curl -X POST http://localhost:5000/api/device/users \
  -H "Content-Type: application/json" \
  -d '{"userId": 50, "name": "Test"}'

# 3. Luego enrollar:
curl -X POST http://localhost:5000/api/device/enroll \
  -H "Content-Type: application/json" \
  -d '{"userId": 50, "fingerId": 1}'

# 4. Usuario presiona dedo 3 veces en lector
```

---

### Problema: Datos desincronizados entre frontend y backend

**Causa**: Caché de usuarios no se invalidó.

**Solución**:
```bash
# Forzar recarga de caché:
curl http://localhost:5000/api/sync/users

# O reiniciar backend:
npm run dev
```

---

## Apéndice: Comandos Útiles

### Backend

```bash
# Desarrollo con auto-reload
npm run dev

# Producción
npm start

# Extrae registros de hoy (CLI)
npm run extract-today

# Desbloquea administrador del dispositivo
npm run unlock-admin
```

### Frontend

```bash
# Desarrollo con HMR
npm run dev

# Compilar para producción
npm run build

# Previsualizar build de producción
npm run preview

# ESLint
npm run lint
npm run lint -- --fix
```

### Dispositivo ZKTeco

```bash
# Conectar y sincronizar (desde frontend)
POST http://localhost:5000/api/sync/attendance

# Extraer datos en CLI
npm run extract-today
```

---

## Conclusión

ZK-teco es una solución integral y escalable para gestión de asistencia biométrica. La arquitectura modular facilita mantenimiento y extensiones futuras.

**Próximos pasos recomendados**:
1. Agregar autenticación y autorización
2. Mejorar heurística de entrada/salida
3. Implementar tests automatizados
4. Migrar a TypeScript (opcional)
5. Optimizar performance con paginación y caché

---

**Documentación preparada para el Sistema ZK-teco**  
*Última actualización: Agosto 2026*
