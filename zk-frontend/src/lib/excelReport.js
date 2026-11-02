// Exportación a Excel del reporte de asistencia.
//
// Usa `xlsx-js-style` (fork de SheetJS que SÍ escribe el atributo `s` de cada
// celda) porque la versión community de `xlsx` descarta los estilos: sin este
// fork no se pueden colorear las faltas ni dar formato a los encabezados.
//
// Reglas de formato acordadas:
//   - las columnas de día van solo en número ("1/09"), sin el día de la semana;
//   - las horas se exportan como "hh:mm" (sin segundos, sin decimales);
//   - la tardanza de cada persona se acumula al final, con su total general;
//   - las faltas van con color distintivo (rojo = sin justificar, azul = justificada);
//   - los días contados son lunes a viernes y sábados (el domingo no).
import { formatSchoolTime } from './schoolTime';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_FILE = 'reporte-asistencia.xlsx';

// --- Estilos de celda -------------------------------------------------------
const side = (rgb) => ({ style: 'thin', color: { rgb } });
const cellBorder = (rgb = 'FFCBD5E1') => ({ top: side(rgb), bottom: side(rgb), left: side(rgb), right: side(rgb) });
const solid = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });

const style = ({ bg, bold, italic, color, size = 10, h = 'center', wrap = false, numFmt } = {}) => ({
  font: { sz: size, bold: !!bold, italic: !!italic, ...(color ? { color: { rgb: color } } : {}) },
  ...(bg ? { fill: solid(bg) } : {}),
  alignment: { horizontal: h, vertical: 'center', wrapText: !!wrap },
  border: cellBorder(),
  ...(numFmt ? { numFmt } : {})
});

// Paleta del libro
const C = {
  head: 'FF334155',
  headOff: 'FF94A3B8',   // columnas de domingo (no laborable)
  band: 'FFF8FAFC',
  late: 'FFFDE68A', lateInk: 'FFB45309',
  absent: 'FFDC2626', absentInk: 'FFFFFFFF',
  just: 'FFBFDBFE', justInk: 'FF1D4ED8',
  review: 'FFEDE9FE', reviewInk: 'FF6D28D9',
  soft: 'FFFEE2E2', softInk: 'FFB91C1C',
  total: 'FF0F172A', totalInk: 'FFFFFFFF',
  ok: 'FF166534',
  legend: 'FFF1F5F9', legendInk: 'FF475569'
};

// --- Formatos de dato -------------------------------------------------------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// "2026-09-01" -> "1/09" (solo día/mes en número, como se pidió)
export const dayLabel = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? `${Number(m[3])}/${m[2]}` : (key || '');
};

// Abreviatura del día de la semana en el molde: L M X J V (y S/D para el fin
// de semana). El índice es el de `getUTCDay` (0 = domingo).
const DOW_ABBR = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const dowOf = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)).getUTCDay() : -1;
};

// Encabezado de la columna de un día: la abreviatura arriba y la fecha abajo
// (el salto de línea + wrapText de la celda los muestran en dos líneas).
export const dayHeadLabel = (key) => {
  const dow = dowOf(key);
  return dow < 0 ? dayLabel(key) : `${DOW_ABBR[dow]}\n${dayLabel(key)}`;
};

// 450 -> "07:30" (solo horas y minutos)
export const hm = (mins) => {
  const n = Math.round(Number(mins));
  if (!Number.isFinite(n) || n <= 0) return '00:00';
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

// 7.5 (horas decimales del backend) -> "07:30"
export const hmFromHours = (hours) => {
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? hm(n * 60) : '';
};

// Días que cuenta el Excel: lunes a viernes y sábados (el domingo no).
const isCountedDay = (key) => {
  const dow = dowOf(key);
  return dow >= 1 && dow <= 6;
};

// La hora de una marca tal como se ve en el colegio (hh:mm, sin segundos).
const clockOf = (iso) => (iso ? formatSchoolTime(iso) : '');

// Un día es "tardanza" si así lo clasificó el backend; el texto del Excel es
// solo la hora, la tardanza se ve por el color de la celda.
const dayKind = (d) => (d.needsReview ? 'review' : (d.status === 'late' ? 'late' : 'ok'));

const kindStyle = (kind) => {
  switch (kind) {
    case 'late': return style({ bg: C.late, bold: true, color: C.lateInk });
    case 'absent': return style({ bg: C.absent, bold: true, color: C.absentInk });
    case 'just': return style({ bg: C.just, bold: true, color: C.justInk });
    case 'review': return style({ bg: C.review, bold: true, italic: true, color: C.reviewInk });
    default: return null;
  }
};

// --- Herramientas de hoja ---------------------------------------------------
const makeTools = (XLSX) => {
  const enc = (r, c) => XLSX.utils.encode_cell({ r, c });

  // Devuelve la celda creándola si hace falta (para poder pintar celdas vacías).
  const at = (ws, r, c) => (ws[enc(r, c)] || (ws[enc(r, c)] = { t: 's', v: '' }));

  const paintRow = (ws, r, c0, c1, s) => {
    for (let c = c0; c <= c1; c++) at(ws, r, c).s = s;
  };

  // Índice de una columna por su título (fila 0).
  const colOf = (ws, name) => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[enc(0, c)];
      if (cell && cell.v === name) return c;
    }
    return -1;
  };

  const lastRowOf = (ws) => XLSX.utils.decode_range(ws['!ref'] || 'A1').e.r;
  const lastColOf = (ws) => XLSX.utils.decode_range(ws['!ref'] || 'A1').e.c;

  const alignOf = (v) => {
    if (isNum(v)) return 'center';
    const s = String(v == null ? '' : v);
    return s.length <= 14 ? 'center' : 'left';
  };

  // Acabado genérico: encabezado oscuro, bordes finos, bandas alternas, números
  // centrados, autofiltro, alto de fila y anchos de columna.
  const finish = (ws, { widths, totalRow } = {}) => {
    const last = lastRowOf(ws);
    const lastCol = lastColOf(ws);
    for (let r = 0; r <= last; r++) {
      for (let c = 0; c <= lastCol; c++) {
        const cell = at(ws, r, c);
        if (r === 0) {
          cell.s = style({ bg: C.head, bold: true, color: C.totalInk, wrap: true });
        } else if (totalRow != null && r === totalRow) {
          cell.s = isNum(cell.v)
            ? style({ bg: C.total, bold: true, color: C.totalInk, numFmt: '0' })
            : style({ bg: C.total, bold: true, color: C.totalInk, h: 'left' });
        } else {
          const bg = r % 2 === 0 ? C.band : null;
          cell.s = isNum(cell.v) ? style({ bg, numFmt: '0' }) : style({ bg, h: alignOf(cell.v) });
        }
      }
    }
    ws['!rows'] = Array.from({ length: last + 1 }, (_, i) => ({ hpt: i === 0 ? 30 : 15 }));
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    const filterLast = totalRow != null ? totalRow - 1 : last;
    if (filterLast > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filterLast, c: lastCol } }) };
    return ws;
  };

  // Resalta una columna numérica: ámbar para tardanzas, rojo para inasistencias.
  // No toca la fila de totales (ya va invertida).
  const markCol = (ws, col, kind, totalRow = null) => {
    if (col < 0) return;
    const last = lastRowOf(ws);
    for (let r = 1; r <= last; r++) {
      if (totalRow != null && r >= totalRow) break;
      const cell = at(ws, r, col);
      if (!isNum(cell.v) || cell.v <= 0) continue;
      cell.s = kind === 'late'
        ? style({ bg: C.late, bold: true, color: C.lateInk, numFmt: '0' })
        : style({ bg: C.soft, bold: true, color: C.softInk, numFmt: '0' });
    }
  };

  return { enc, at, paintRow, colOf, finish, markCol, lastRowOf };
};

// --- Hoja 1: molde matricial (persona x día) --------------------------------
const listDayKeys = (users, from, to) => {
  const seen = new Set();
  const out = [];
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const cur = new Date(Date.UTC(fy, fm - 1, fd, 12, 0, 0));
    for (let guard = 0; guard < 400; guard++) {
      const key = cur.toISOString().slice(0, 10);
      if (key > to) break;
      if (!seen.has(key)) { seen.add(key); out.push(key); }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  users.forEach((u) => {
    (u.days || []).forEach((d) => d.date && seen.add(d.date));
    (u.absentDays || []).forEach((d) => d && seen.add(d));
  });
  seen.forEach((k) => { if (!out.includes(k)) out.push(k); });
  return out.sort();
};

const buildMold = (XLSX, T, users, { showPayroll, groupLabel, from, to }) => {
  const dayKeys = listDayKeys(users, from, to);
  const head = ['N°', 'Apellidos y nombres', showPayroll ? 'Área / cargo' : groupLabel];
  dayKeys.forEach((k) => head.push(dayHeadLabel(k)));
  head.push('Total tardanzas (min)', 'Inasistencias');
  if (showPayroll) head.push('Falta justificada', 'Falta sin justificar', 'Tard. cobrable (min)');
  head.push('Días a revisar');

  const dayCol = 3;
  const lateCol = dayCol + dayKeys.length;
  const absCol = lateCol + 1;
  const justCol = absCol + 1;
  const unjustCol = showPayroll ? justCol + 1 : -1;
  const chargedCol = showPayroll ? justCol + 2 : -1;
  const reviewCol = (showPayroll ? chargedCol : justCol) + 1;
  const nCols = reviewCol + 1;

  const rows = [head];
  const kindsByRow = [];
  const totals = {
    day: new Array(dayKeys.length).fill(0),
    late: 0, abs: 0, just: 0, unjust: 0, charged: 0, review: 0
  };

  users.forEach((u, i) => {
    const byDate = new Map((u.days || []).map((d) => [d.date, d]));
    const justSet = new Set(u.justifiedAbsences || []);
    const unjustSet = new Set(u.unjustifiedAbsences || []);
    const absSet = new Set(u.absentDays || []);

    const cells = [];
    const kinds = [];
    dayKeys.forEach((key, idx) => {
      const d = byDate.get(key);
      if (d) {
        cells.push(clockOf(d.checkIn) || '—');
        kinds.push(dayKind(d));
        totals.day[idx] += 1;
      } else if (justSet.has(key)) {
        cells.push('FJ');
        kinds.push('just');
      } else if (unjustSet.has(key) || absSet.has(key)) {
        cells.push('F');
        kinds.push('absent');
      } else {
        cells.push('');
        kinds.push('empty');
      }
    });

    const lateMins = (u.days || []).reduce((s, d) => s + (d.lateMinutes || 0), 0);
    const row = [i + 1, u.name, showPayroll ? (u.area || u.grade || 'General') : (u.grade || 'General'), ...cells, lateMins, absSet.size];
    if (showPayroll) {
      row.push(u.justifiedAbsenceCount || 0, u.unjustifiedAbsenceCount || 0, u.lateMinutesCharged ?? 0);
    }
    row.push(u.reviewDays || 0);
    rows.push(row);
    kindsByRow.push(kinds);

    totals.late += lateMins;
    totals.abs += absSet.size;
    totals.just += u.justifiedAbsenceCount || 0;
    totals.unjust += u.unjustifiedAbsenceCount || 0;
    totals.charged += u.lateMinutesCharged ?? 0;
    totals.review += u.reviewDays || 0;
  });

  // Fila de totales: una por día (presentes), el total de tardanzas de todas las
  // personas y el resto de indicadores acumulados.
  const totalRow = rows.length;
  const totalsRow = ['', 'TOTALES', `${users.length} persona(s)`, ...totals.day, totals.late, totals.abs];
  if (showPayroll) totalsRow.push(totals.just, totals.unjust, totals.charged);
  totalsRow.push(totals.review);
  rows.push(totalsRow);

  // Leyenda de colores al pie, dos filas más abajo (fuera del autofiltro).
  const legendRow = rows.length + 1;
  rows.push([]);
  rows.push(['Leyenda: celda ámbar = tardanza · celda roja = falta sin justificar · celda azul = falta justificada · celda lila = día a revisar · Días contados: lunes a viernes y sábados']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Encabezado: abreviatura del día encima de la fecha (wrapText) y domingos
  // en gris porque no son días laborables.
  T.paintRow(ws, 0, 0, nCols - 1, style({ bg: C.head, bold: true, color: C.totalInk, wrap: true }));
  dayKeys.forEach((k, i) => {
    T.at(ws, 0, dayCol + i).s = style({ bg: isCountedDay(k) ? C.head : C.headOff, bold: true, color: C.totalInk, wrap: true });
  });

  // Cuerpo: bandas alternas, y color por tipo de día.
  users.forEach((u, i) => {
    const r = i + 1;
    const bg = r % 2 === 0 ? C.band : null;
    T.at(ws, r, 0).s = style({ bg, numFmt: '0' });
    T.at(ws, r, 1).s = style({ bg, h: 'left' });
    T.at(ws, r, 2).s = style({ bg, h: 'left' });
    kindsByRow[i].forEach((kind, j) => {
      T.at(ws, r, dayCol + j).s = kindStyle(kind) || style({ bg });
    });
    T.at(ws, r, lateCol).s = rows[r][lateCol] > 0
      ? style({ bg: C.late, bold: true, color: C.lateInk, numFmt: '0' })
      : style({ bg, numFmt: '0' });
    T.at(ws, r, absCol).s = rows[r][absCol] > 0
      ? style({ bg: C.soft, bold: true, color: C.softInk, numFmt: '0' })
      : style({ bg, numFmt: '0' });
    if (showPayroll) {
      T.at(ws, r, justCol).s = style({ bg, numFmt: '0' });
      T.at(ws, r, unjustCol).s = rows[r][unjustCol] > 0
        ? style({ bg: C.absent, bold: true, color: C.absentInk, numFmt: '0' })
        : style({ bg, numFmt: '0' });
      T.at(ws, r, chargedCol).s = style({ bg, numFmt: '0' });
    }
    T.at(ws, r, reviewCol).s = rows[r][reviewCol] > 0
      ? style({ bg: C.review, bold: true, color: C.reviewInk, numFmt: '0' })
      : style({ bg, numFmt: '0' });
  });

  // Fila TOTALES invertida; la de tardanzas destacada en ámbar.
  T.paintRow(ws, totalRow, 0, nCols - 1, style({ bg: C.total, bold: true, color: C.totalInk, numFmt: '0' }));
  T.at(ws, totalRow, 1).s = style({ bg: C.total, bold: true, color: C.totalInk, h: 'left' });
  T.at(ws, totalRow, 2).s = style({ bg: C.total, bold: true, color: C.totalInk, h: 'left' });
  T.at(ws, totalRow, lateCol).s = style({ bg: C.lateInk, bold: true, color: C.totalInk, numFmt: '0' });
  if (totals.abs > 0) T.at(ws, totalRow, absCol).s = style({ bg: C.absent, bold: true, color: C.absentInk, numFmt: '0' });

  // Leyenda de colores: fila combinada al pie de la tabla.
  ws['!merges'] = [{ s: { r: legendRow, c: 0 }, e: { r: legendRow, c: nCols - 1 } }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: legendRow, c: nCols - 1 } });
  T.paintRow(ws, legendRow, 0, nCols - 1, style({ bg: C.legend, italic: true, color: C.legendInk, h: 'left', size: 9 }));

  ws['!rows'] = Array.from({ length: legendRow + 1 }, (_, i) => ({ hpt: i === 0 ? 30 : (i === legendRow ? 18 : 15) }));
  ws['!cols'] = [
    { wch: 5 }, { wch: 34 }, { wch: 20 },
    ...dayKeys.map(() => ({ wch: 7 })),
    { wch: 12 }, { wch: 12 },
    ...(showPayroll ? [{ wch: 12 }, { wch: 12 }, { wch: 12 }] : []),
    { wch: 11 }
  ];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow - 1, c: nCols - 1 } }) };

  return { ws, totalRow };
};

// --- Hoja 2: resumen por persona -------------------------------------------
const buildSummary = (XLSX, T, users, { showPayroll, groupLabel, showPunctuality, shiftLabel }) => {
  const rows = users.map((u, i) => {
    const pDays = (u.days || []).length;
    const onTime = (u.days || []).filter((d) => d.status === 'on-time').length;
    const rate = pDays > 0 ? Math.round((onTime / pDays) * 100) : 0;
    const row = {
      'N°': i + 1,
      'Apellidos y nombres': u.name,
      [showPayroll ? 'Área / cargo' : groupLabel]: showPayroll ? (u.area || u.grade || 'General') : (u.grade || 'General'),
      'Días': pDays,
      'A tiempo': onTime,
      'Tardanzas': u.lateDays || 0,
      'Minutos tarde': (u.days || []).reduce((s, d) => s + (d.lateMinutes || 0), 0),
      'Inasistencias': (u.absentDays || []).length,
      'Fechas inasistencia': (u.absentDays || []).map(dayLabel).join(', '),
      'Salidas': (u.days || []).filter((d) => d.checkOut).length
    };
    if (showPunctuality) row['Puntualidad %'] = rate;
    row['Días a revisar'] = u.reviewDays || 0;
    if (showPayroll) {
      row['Turno'] = shiftLabel(u.shift);
      row['Días esperados'] = u.expectedDays || 0;
      row['Días laborados'] = u.workedDays ?? pDays;
      row['Horas laboradas'] = hm(u.workedMinutes || 0);
      row['Minutos laborados'] = u.workedMinutes || 0;
      row['Horas extra'] = hm(u.extraMinutes || 0);
      row['Minutos extra'] = u.extraMinutes || 0;
      row['Cumplimiento %'] = u.compliancePct == null ? '' : u.compliancePct;
      row['Falta justificada'] = u.justifiedAbsenceCount || 0;
      row['Falta sin justificar'] = u.unjustifiedAbsenceCount || 0;
      row['Tardanzas cobrables (min)'] = u.lateMinutesCharged ?? 0;
      row['Tardanzas justificadas (min)'] = u.lateMinutesExcused || 0;
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  T.finish(ws, { widths: [5, 34, 20, 9, 10, 11, 12, 13, 34, 10] });
  T.markCol(ws, T.colOf(ws, 'Minutos tarde'), 'late');
  T.markCol(ws, T.colOf(ws, 'Tardanzas cobrables (min)'), 'late');
  T.markCol(ws, T.colOf(ws, 'Inasistencias'), 'absent');
  T.markCol(ws, T.colOf(ws, 'Falta sin justificar'), 'absent');
  T.markCol(ws, T.colOf(ws, 'Días a revisar'), 'absent');
  return ws;
};

// --- Hoja 3: detalle diario -------------------------------------------------
const buildDetail = (XLSX, T, users, { showPayroll, groupLabel, showTimes }) => {
  const rows = [];
  users.forEach((u) => {
    (u.days || []).forEach((d) => {
      rows.push({
        'Fecha': dayLabel(d.date),
        'Apellidos y nombres': u.name,
        [showPayroll ? 'Área / cargo' : groupLabel]: showPayroll ? (u.area || u.grade || 'General') : (u.grade || 'General'),
        'Entrada': clockOf(d.checkIn),
        'Salida': d.checkOut ? clockOf(d.checkOut) : '',
        'Estado': d.status === 'late' ? 'Tardanza' : 'A tiempo',
        'Minutos tarde': d.lateMinutes || 0,
        'Horas': hmFromHours(d.hoursWorked),
        'Justificación': ((u.excuses || []).find((x) => x.day === d.date) || {}).label || '',
        'Marcaciones': showTimes ? (Array.isArray(d.marks) ? d.marks.map(clockOf).join(' · ') : '') : '',
        'Observación': d.needsReview ? (d.reviewReason || 'A revisar') : ''
      });
    });
  });
  if (rows.length === 0) return null;

  const ws = XLSX.utils.json_to_sheet(rows);
  T.finish(ws, { widths: [9, 34, 20, 9, 9, 11, 12, 9, 16, 26, 18] });
  T.markCol(ws, T.colOf(ws, 'Minutos tarde'), 'late');

  // Estado y observación a color para que se distingan de un vistazo.
  const cEstado = T.colOf(ws, 'Estado');
  const cObs = T.colOf(ws, 'Observación');
  const last = T.lastRowOf(ws);
  for (let r = 1; r <= last; r++) {
    const estado = ws[T.enc(r, cEstado)];
    if (estado && estado.v === 'Tardanza') estado.s = style({ bg: C.late, bold: true, color: C.lateInk });
    if (estado && estado.v === 'A tiempo') estado.s = style({ color: C.ok, bold: true });
    const obs = ws[T.enc(r, cObs)];
    if (obs && String(obs.v || '').trim()) obs.s = style({ bg: C.review, italic: true, color: C.reviewInk, h: 'left' });
  }
  return ws;
};

// --- Hoja 4: planilla RR.HH. ----------------------------------------------
const buildPayroll = (XLSX, T, users, { payRows, payTotals, shiftLabel }) => {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const rows = payRows.map((r, i) => {
    const src = byId.get(r.user_id) || {};
    return {
      'N°': i + 1,
      'Apellidos y nombres': r.name,
      'Área / cargo': r.area,
      'Turno': shiftLabel(r.shift),
      'Días esperados': r.expectedDays,
      'Días laborados': r.workedDays,
      'Horas laboradas': hm(src.workedMinutes || 0),
      'Minutos laborados': src.workedMinutes || 0,
      'Horas extra': hm(r.extraMinutes),
      'Minutos extra': r.extraMinutes,
      'Cumplimiento %': r.compliancePct == null ? '' : r.compliancePct,
      'Tarde. cobrable (min)': r.lateCharged,
      'Tarde. justificada (min)': r.lateExcused,
      'Falta justificada': r.absentJustified,
      'Falta sin justificar': r.absentUnjustified
    };
  });

  rows.push({
    'N°': '',
    'Apellidos y nombres': 'TOTALES',
    'Área / cargo': `${payTotals.people} persona(s)`,
    'Turno': '',
    'Días esperados': payTotals.expectedDays,
    'Días laborados': payTotals.workedDays,
    'Horas laboradas': hm(payTotals.workedMinutes),
    'Minutos laborados': payTotals.workedMinutes,
    'Horas extra': hm(payTotals.extraMinutes),
    'Minutos extra': payTotals.extraMinutes,
    'Cumplimiento %': '',
    'Tarde. cobrable (min)': payTotals.lateCharged,
    'Tarde. justificada (min)': payTotals.lateExcused,
    'Falta justificada': payTotals.absentJustified,
    'Falta sin justificar': payTotals.absentUnjustified
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // json_to_sheet escribe el encabezado como fila 0: TOTALES cae en rows.length.
  const totalRow = rows.length;
  T.finish(ws, {
    totalRow,
    widths: [5, 34, 22, 9, 13, 12, 13, 14, 11, 12, 12, 14, 15, 13, 14]
  });
  T.markCol(ws, T.colOf(ws, 'Tarde. cobrable (min)'), 'late', totalRow);
  T.markCol(ws, T.colOf(ws, 'Tarde. justificada (min)'), 'late', totalRow);
  T.markCol(ws, T.colOf(ws, 'Falta sin justificar'), 'absent', totalRow);
  return ws;
};

// --- Hoja 5: justificaciones ------------------------------------------------
const buildExcuses = (XLSX, T, excuses) => {
  if (!excuses || excuses.length === 0) return null;
  const rows = excuses.map((x, i) => ({
    'N°': i + 1,
    'Fecha': dayLabel(x.day),
    'Apellidos y nombres': x.name,
    'Área / cargo': x.area,
    'Tipo': x.label || x.type,
    'Documento': x.document || '',
    'Cubre tardanza': x.coversLate ? 'Sí' : 'No',
    'Detalle': x.note || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  T.finish(ws, { widths: [5, 10, 34, 22, 16, 14, 14, 40] });
  const cCubre = T.colOf(ws, 'Cubre tardanza');
  if (cCubre >= 0) {
    for (let r = 1; r <= T.lastRowOf(ws); r++) {
      const cell = ws[T.enc(r, cCubre)];
      if (cell && cell.v === 'Sí') cell.s = style({ bg: C.just, bold: true, color: C.justInk });
    }
  }
  return ws;
};

// --- Hoja 6: resumen por área ----------------------------------------------
const buildByArea = (XLSX, T, byArea) => {
  if (!byArea || byArea.length === 0) return null;
  const rows = byArea.map((g) => ({
    'Área / cargo': g.area,
    'Personas': g.people,
    'Días laborados': g.workedDays,
    'Horas laboradas': hm(g.workedMinutes),
    'Minutos laborados': g.workedMinutes,
    'Horas extra': hm(g.extraMinutes),
    'Minutos extra': g.extraMinutes,
    'Tarde. cobrable (min)': g.lateCharged,
    'Falta justificada': g.absentJustified,
    'Falta sin justificar': g.absentUnjustified,
    'Integrantes': g.names.join(' · ')
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  T.finish(ws, { widths: [24, 10, 13, 13, 14, 11, 12, 14, 13, 14, 60] });
  T.markCol(ws, T.colOf(ws, 'Tarde. cobrable (min)'), 'late');
  T.markCol(ws, T.colOf(ws, 'Falta sin justificar'), 'absent');
  return ws;
};

// --- Punto de entrada -------------------------------------------------------
export async function buildAttendanceWorkbook(ctx) {
  const {
    users = [], showPayroll, groupLabel, showPunctuality, filters = {},
    payRows = [], payTotals = {}, byArea = [], excuses = [], shiftLabel = () => '—'
  } = ctx;

  const mod = await import('xlsx-js-style');
  const XLSX = mod.default || mod;
  const T = makeTools(XLSX);

  const wb = XLSX.utils.book_new();

  if (users.length > 0) {
    const { ws } = buildMold(XLSX, T, users, {
      showPayroll, groupLabel, from: filters.from, to: filters.to
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  }

  XLSX.utils.book_append_sheet(wb, buildSummary(XLSX, T, users, { showPayroll, groupLabel, showPunctuality, shiftLabel }), 'Resumen');

  const detail = buildDetail(XLSX, T, users, { showPayroll, groupLabel, showTimes: filters.showTimes });
  if (detail) XLSX.utils.book_append_sheet(wb, detail, 'Detalle diario');

  if (showPayroll) {
    XLSX.utils.book_append_sheet(wb, buildPayroll(XLSX, T, users, { payRows, payTotals, shiftLabel }), 'Planilla RR.HH.');
    const exc = buildExcuses(XLSX, T, excuses);
    if (exc) XLSX.utils.book_append_sheet(wb, exc, 'Justificaciones');
    const areas = buildByArea(XLSX, T, byArea);
    if (areas) XLSX.utils.book_append_sheet(wb, areas, 'Resumen por área');
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
}