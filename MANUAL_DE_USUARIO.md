# MANUAL DE USUARIO — Sistema de Asistencias ZKTeco

**Colegio Galileo · Control de asistencia con huella digital**

Este manual está pensado para el uso diario del sistema. El sistema opera en **modo estándar de consulta**: muestra la información registrada por el lector de huellas y permite generar reportes, pero **no permite modificar ni borrar marcaciones**. Así se garantiza que los datos de asistencia sean siempre fielmente los que registró el dispositivo.

---

## 1. ¿Cómo funciona el sistema?

1. Cada persona registra su huella en el **lector ZKTeco** al llegar, al salir a refrigerio, al regresar y al terminar su jornada.
2. El lector guarda las marcaciones con fecha y hora.
3. El sistema **sincroniza** esas marcaciones con la base de datos (botón *Sincronizar* o sincronización automática).
4. Desde el navegador puedes **consultar** el Dashboard, las Asistencias, los Usuarios, los Horarios, los Reportes, las Incidencias y los Estudiantes.

> **Importante:** el sistema calcula todo (tardanzas, inasistencias, horas trabajadas) a partir de las marcas del lector. Si una persona no marcó, el sistema lo registra como inasistencia; por eso es importante marcar siempre al entrar y al salir.

---

## 2. Inicio del sistema (encargado de cómputo)

1. Encender la PC del backend y ejecutar el servidor (`npm start` o `npm run dev` dentro de `zk-backend`).
2. Abrir el navegador en la dirección del sistema (por defecto `http://localhost:5173` con `npm run dev`).
3. Verificar que el lector esté conectado a la misma red y encendido.

No se necesita ninguna contraseña para usar el sistema: todas las pantallas son de consulta.

---

## 3. Sincronizar marcaciones

- Usa el botón **Sincronizar** (esquina del menú lateral) para traer al sistema las personas y marcaciones nuevas del lector.
- Recomendación: sincronizar al menos **una vez por la mañana y una al final del día**.
- Si el backend tiene la sincronización automática activada (configurada en el archivo `settings.json` del servidor), las marcas llegan solas cada pocos minutos.

---

## 4. Secciones del menú

### 4.1 Dashboard
Vista general del día:
- Tarjetas: **usuarios registrados, llegaron a tiempo, llegaron tarde y ausentes hoy**.
- Barras de progreso: asistencia del día, puntualidad y quienes registraron salida.
- Listas de **llegadas tarde** y **salidas temprano**.
- **Tendencia semanal** (barras por día).
- Filtro por grado/sector (Todo el colegio, 3°/4°/5° Secundaria, Docentes/Personal, General).

### 4.2 Asistencias
Lista de marcaciones con:
- Filtros de tiempo: **Hoy / 7 días / Todo**.
- Filtro múltiple por **grado**.
- Cada fila muestra: persona, grado, fecha, hora, tipo de marca (Entrada, Salida a refrigerio, Regreso de refrigerio, Salida final) y estado (**A tiempo / Tarde +min / Inasistencia**).
- Si ves una marca con el rótulo **⚠ dup**, es una segunda huella consecutiva del mismo día que el sistema agrupó automáticamente (doble toque del dedo); no afecta los cálculos.
- Los días con **⚠ a revisar** (doble marcación absorbida, más de 4 marcas o marca de madrugada) se pueden verificar comparando con la pantalla del lector.

> Esta pantalla es **solo de consulta**: no hay botones de editar ni eliminar marcaciones. Las correcciones solo deben hacerse en el propio lector o en la base de datos por personal técnico.

### 4.3 Usuarios
- **Nuevo usuario**: botón *Nuevo usuario* → asignar ID numérico, nombre y Grado/Área.
- **Registrar huella**: se hace en el lector físico. El sistema muestra una guía paso a paso:
  1. Presionar **M/OK** en el lector para abrir el menú.
  2. Entrar a *Usuarios* y buscar el ID de la persona.
  3. En la opción *Huella*, apoyar el dedo **3 veces** cuando el lector lo pida.
- **Editar**: cambiar nombre o Grado/Área (el ID no se puede cambiar).
- **Eliminar**: borra a la persona del lector y de la base de datos, **incluidas todas sus asistencias** (irreversible).
- Al hacer clic en una persona se ve su historial: estadísticas, % de puntualidad y día por día (entrada, salida, horas trabajadas, estado).

### 4.4 Horarios
Define **cuándo debe asistir** cada persona; sirve para calcular tardanzas e inasistencias correctamente:
- Por persona (fila): **días de asistencia** (L M X J V S D), **hora límite de entrada**, **hora de salida**, **área/cargo**, **turno** (mañana/tarde/noche) y **fechas no laborables** (feriados, permisos conocidos).
- **Aplicar a seleccionados**: marca varias filas con los checkboxes y aplica los mismos días/horarios/área/turno en bloque.
- **Quitar horario** (icono de basura): la persona vuelve a la regla general (lunes a viernes con los horarios generales configurados en el servidor).
- Si una persona no tiene horario personal, se usa la regla general del colegio.

### 4.5 Reportes
Genera el reporte oficial del período:
1. Elegir **rango de fechas** (y opcionalmente grado o una persona).
2. Pulsar **Generar reporte**.
3. Filtros rápidos: *Solo tardanzas*, *Solo inasistencias*, *Solo sin justificar*, *Solo a revisar*.
4. Formato del documento:
   - **Consolidado**: una sola lista con todas las personas, inasistencias por fecha y anexo de tardanzas.
   - **Detallado**: carátula con resumen + una hoja por persona.
5. Opciones de columnas: marcaciones detalladas, hora de salida, minutos tardados, resumen de planilla (solo personal).
6. **Marca del documento**: logo, nombre de la institución y subtítulo que aparecen impresos.
7. Salidas: **Imprimir** (desde ahí se puede guardar como PDF), **Excel (.xlsx)** y **CSV**.

En el reporte, las personas pueden excluirse/incluirse de la impresión con las casillas de selección de la vista previa.

### 4.6 Incidencias
Registro de avisos excepcionales (olvido de marcación, lector dañado, permiso, etc.):
- **Nueva incidencia**: empleado, fecha, tipo y descripción.
- Se puede **eliminar** con el icono de basura.
- Las incidencias son informativas: no cambian los cálculos de asistencia.

### 4.7 Estudiantes
- Pestaña **Tardanzas e Inasistencias**: lista de alumnos con tardanzas/faltas por rango de fechas y grado.
  - **Notificar por WhatsApp**: botón *Enviar* que abre WhatsApp con el mensaje listo para el tutor del alumno (requiere contacto registrado).
- Pestaña **Contactos de Padres**: agregar, editar o eliminar el contacto de WhatsApp (nombre del padre y número de 9 a 15 dígitos).

---

## 5. Justificaciones (solo lectura)

Las justificaciones (licencias, permisos, comisiones, vacaciones, etc.) **ya no se registran desde el sistema**; aparecen en el Reporte como información de solo lectura y clasifican las faltas como "justificadas" o "sin justificar" según los datos ya guardados.

Si necesitas registrar o quitar una justificación, solicítalo al personal técnico encargado del servidor.

---

## 6. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| No aparecen marcaciones de hoy | Pulsar **Sincronizar**; verificar que la persona haya marcado y que el lector esté conectado a la red. |
| Una persona aparece como inasistencia | Verificar en Asistencias que no haya marcado; si marcó y no aparece, sincronizar y revisar que el reloj del lector esté en hora correcta. |
| El lector pide contraseña para entrar a su menú | Un técnico puede desbloquearlo con la función de desbloqueo del servidor (`npm run unlock-admin` en `zk-backend`). |
| "Error de conexión con el dispositivo" | Verificar cable/red y que la IP del lector en `zk-backend/.env` sea la correcta. |
| Las horas se ven desplazadas | El sistema usa la zona horaria del colegio (configurada en el servidor); no cambiar el reloj de la PC corrige esto, lo hace el técnico con `settings.json`. |
| El botón Sincronizar da error | El backend puede no estar corriendo o el lector está apagado/desconectado. |

---

## 7. Buenas prácticas

- Marcar **siempre al entrar y al salir** (incluido el refrigerio), una sola vez por evento.
- No apoyar el dedo dos veces seguidas: el sistema agrupa marcas muy cercanas, pero es mejor evitarlo.
- Mantener los **horarios** actualizados en la sección Horarios antes de cada período de reporte.
- Generar los reportes **después** de la última sincronización del día.
- No compartir la PC del servidor con aplicaciones ajenas al sistema.

---

*Sistema de Asistencias — Colegio Galileo. Uso estándar: consulta de asistencia, reportes y gestión de usuarios. Sin opciones de administrador ni edición de datos desde la interfaz.*
