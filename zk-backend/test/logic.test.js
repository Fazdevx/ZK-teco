'use strict';

process.env.SCHOOL_TZ_OFFSET_MINUTES = '-300';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/logic');

// Instante UTC que en la zona del colegio (UTC-5) representa y-mo-d h:mm:ss.
// (school wall time - offset => UTC instant)
const schoolInstant = (y, mo, d, h, mi, s = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi, s) - (-300) * 60000);

// Settings base: límite 08:00, inasistencia 09:00, sábado 08:30 / 09:00.
const SETTINGS = {
  lateHour: 8, lateMinute: 0, toleranceMinutes: 0,
  absenceAfterHour: 9, absenceAfterMinute: 0,
  saturdayLateHour: 8, saturdayLateMinute: 30,
  saturdayAbsenceAfterHour: 9, saturdayAbsenceAfterMinute: 0,
  workEndHour: 18, workEndMinute: 0,
  doubleTapToleranceMinutes: 1,
  tzOffsetMinutes: -300
};

const mk = (h, m, s = 0, id) => ({ id, user_id: 100, check_time: schoolInstant(2026, 9, 23, h, m, s).toISOString() });

test('deviceTsToInstant convierte la hora de pared del lector a UTC real', () => {
  const wall = new Date(2026, 8, 23, 7, 5, 0); // lo que devuelve zklib-ng
  const inst = L.deviceTsToInstant(wall);
  assert.equal(inst.getUTCHours(), 12);
  assert.equal(inst.getUTCMinutes(), 5);
  const orig = new Date(NaN);
  assert.equal(L.deviceTsToInstant(orig), orig);
});

test('getSchoolTotal / getSchoolTotalSeconds / getDayKey usan la zona del colegio', () => {
  const t = schoolInstant(2026, 9, 23, 7, 35, 0);
  assert.equal(L.getSchoolTotal(t), 455);
  assert.equal(L.getSchoolTotalSeconds(t), 455 * 60);
  assert.equal(L.getDayKey(t), '2026-09-23');
});

test('dateStrToSchoolInstant redondea el mismo día en la zona del colegio', () => {
  const inst = L.dateStrToSchoolInstant('2026-09-23', 7, 35);
  assert.equal(L.getDayKey(inst), '2026-09-23');
  assert.equal(L.getSchoolTotal(inst), 455);
});

test('frontera on-time/late es exacta al segundo; tarde cuenta minutos completos', () => {
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 8, 0, 0), SETTINGS), 'on-time');
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 8, 0, 1), SETTINGS), 'late');
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 7, 35, 0), SETTINGS), 'on-time');
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 9, 0, 0), SETTINGS), 'absent');
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 10, 0, 0), SETTINGS), 'absent');

  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 8, 0, 0), SETTINGS), 0);
  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 8, 0, 1), SETTINGS), 0);
  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 8, 1, 0), SETTINGS), 1);
  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 8, 15, 0), SETTINGS), 15);
  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 9, 0, 0), SETTINGS), 0);
});

test('toleranceMinutes empuja la frontera igual en cualquier día', () => {
  const tol = { ...SETTINGS, toleranceMinutes: 10 };
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 8, 10, 0), tol), 'on-time');
  assert.equal(L.getDayStatus(schoolInstant(2026, 9, 23, 8, 10, 30), tol), 'late');
  assert.equal(L.getLateMinutes(schoolInstant(2026, 9, 23, 8, 11, 0), tol), 1);
});

test('sábados usan sus propias reglas de tardanza e inasistencia', () => {
  const sat = (h, mi, s = 0) => schoolInstant(2026, 9, 19, h, mi, s); // 2026-09-19 es sábado
  assert.equal(L.getDayStatus(sat(8, 15, 0), SETTINGS), 'on-time');
  assert.equal(L.getDayStatus(sat(8, 30, 0), SETTINGS), 'on-time');
  assert.equal(L.getDayStatus(sat(8, 30, 1), SETTINGS), 'late');
  assert.equal(L.getDayStatus(sat(9, 0, 0), SETTINGS), 'absent');
  const limits = L.getDayLimits(sat(0, 0, 0), SETTINGS);
  assert.equal(limits.isSaturday, true);
  assert.equal(limits.limitTotal, 8 * 60 + 30);
  assert.equal(limits.absentTotal, 9 * 60);
});

test('groupDoubleTaps agrupa toques cercanos y respeta tolerancia 0', () => {
  const logs = [
    { id: 1, check_time: schoolInstant(2026, 9, 23, 7, 30, 0) },
    { id: 2, check_time: schoolInstant(2026, 9, 23, 7, 30, 30) },
    { id: 3, check_time: schoolInstant(2026, 9, 23, 7, 33, 0) }
  ];
  const groups = L.groupDoubleTaps(logs, SETTINGS);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map(l => l.id), [1, 2]);
  assert.deepEqual(groups[1].map(l => l.id), [3]);
  const none = L.groupDoubleTaps(logs, { ...SETTINGS, doubleTapToleranceMinutes: 0 });
  assert.equal(none.length, 3);
});

test('firstEffectivePunch salta marcas de madrugada y las marca sospechosas', () => {
  const early = { date: schoolInstant(2026, 9, 23, 3, 10, 0) };
  const normal = { date: schoolInstant(2026, 9, 23, 7, 40, 0) };
  const r = L.firstEffectivePunch([early, normal]);
  assert.equal(r.first, normal);
  assert.equal(r.stray, true);
  const r2 = L.firstEffectivePunch([normal]);
  assert.equal(r2.first, normal);
  assert.equal(r2.stray, false);
});

test('buildDaySummaries: día completo de 4 marcas con horas correctas', () => {
  const day = [mk(7, 30), mk(12, 0, 0, 3), mk(12, 45, 0, 4), mk(18, 0, 0, 5)];
  const sums = L.buildDaySummaries(day, SETTINGS);
  assert.equal(sums.length, 1);
  const d = sums[0];
  assert.equal(d.date, '2026-09-23');
  assert.equal(d.status, 'on-time');
  assert.equal(d.totalChecks, 4);
  assert.equal(d.needsReview, false);
  assert.equal(d.lunchOutType, 'exit');
  assert.equal(d.lunchInType, 'entry');
  // (12:00-7:30) + (18:00-12:45) = 4.5 + 5.25 = 9.75h
  assert.equal(d.hoursWorked, '9.8');
});

test('buildDaySummaries: doble marcación se colapsa y marca el día a revisar', () => {
  const day = [mk(7, 30), mk(7, 30, 40, 2), mk(12, 0, 0, 3), mk(12, 45, 0, 4), mk(18, 0, 0, 5)];
  const d = L.buildDaySummaries(day, SETTINGS)[0];
  assert.equal(d.totalChecks, 5);
  assert.equal(d.needsReview, true);
  assert.equal(d.reviewReason, 'Doble marcación');
  assert.equal(d.hoursWorked, '9.8'); // mismo cálculo que sin el toque duplicado
});

test('buildDaySummaries: marca de madrugada no define estado y se revisa', () => {
  const day = [mk(3, 10), mk(7, 45, 0, 2), mk(18, 0, 0, 3)];
  const d = L.buildDaySummaries(day, SETTINGS)[0];
  assert.equal(d.status, 'on-time'); // usa 7:45, no 3:10
  assert.equal(d.lateMinutes, 0);
  assert.equal(d.needsReview, true);
  assert.equal(d.reviewReason, 'Marca sospechosa');
});

test('buildDaySummaries: más de 4 marcas efectivas -> a revisar', () => {
  const day = [
    mk(7, 30), mk(11, 0, 0, 2), mk(12, 0, 0, 3),
    mk(13, 0, 0, 4), mk(16, 0, 0, 5), mk(18, 0, 0, 6)
  ];
  const d = L.buildDaySummaries(day, SETTINGS)[0];
  assert.equal(d.totalChecks, 6);
  assert.equal(d.needsReview, true);
  assert.equal(d.reviewReason, 'Más de 4 marcas');
});

test('buildDaySummaries: día tarde suma minutos y respeta horario personal', () => {
  const day = [mk(8, 5), mk(18, 0, 0, 2)];
  const d = L.buildDaySummaries(day, SETTINGS)[0];
  assert.equal(d.status, 'late');
  assert.equal(d.lateMinutes, 5);

  const sched = { lateMinutes: 7 * 60, endMinutes: 18 * 60, days: [1, 2, 3, 4, 5], offDates: [] };
  const lateAt710 = [mk(7, 10), mk(18, 0, 0, 2)];
  const d2 = L.buildDaySummaries(lateAt710, SETTINGS, sched)[0];
  assert.equal(d2.status, 'late');
  assert.equal(d2.lateMinutes, 10);
});

test('isExpectedWorkDaySync respeta regla general, days y offDates', () => {
  assert.equal(L.isExpectedWorkDaySync(null, 1, '2026-09-23'), true); // lunes
  assert.equal(L.isExpectedWorkDaySync(null, 5, '2026-09-25'), true); // viernes
  assert.equal(L.isExpectedWorkDaySync(null, 6, '2026-09-19'), false); // sábado
  assert.equal(L.isExpectedWorkDaySync(null, 0, '2026-09-20'), false); // domingo
  assert.equal(L.isExpectedWorkDaySync({ days: [1, 2, 3, 4, 5], offDates: [] }, 1, '2026-09-23'), true);
  assert.equal(L.isExpectedWorkDaySync({ days: [1, 2, 3, 4, 5], offDates: ['2026-09-23'] }, 1, '2026-09-23'), false);
  assert.equal(L.isExpectedWorkDaySync({ days: [0], offDates: [] }, 0, '2026-09-20'), true);
});

test('getPunchType: heurística AM=entrada / PM=salida (granularidad minuto)', () => {
  assert.equal(L.getPunchType(schoolInstant(2026, 9, 23, 7, 30, 0)), 'entry');
  assert.equal(L.getPunchType(schoolInstant(2026, 9, 23, 12, 0, 0)), 'entry'); // 12:00 exacto = entrada
  assert.equal(L.getPunchType(schoolInstant(2026, 9, 23, 12, 0, 30)), 'entry'); // trunca a 12:00
  assert.equal(L.getPunchType(schoolInstant(2026, 9, 23, 12, 1, 0)), 'exit');
  assert.equal(L.getPunchType(schoolInstant(2026, 9, 23, 18, 0, 0)), 'exit');
});

test('getUserEndTotal usa horario personal o el de settings', () => {
  assert.equal(L.getUserEndTotal({ endMinutes: 1000 }, SETTINGS), 1000);
  assert.equal(L.getUserEndTotal(null, { workEndHour: 18, workEndMinute: 0 }), 18 * 60);
});

test('getPunchLabel: intermedios AM=regreso refrigerio, PM=salida refrigerio', () => {
  const logs = [
    { check_time: schoolInstant(2026, 9, 23, 7, 30, 0).toISOString() },
    { check_time: schoolInstant(2026, 9, 23, 10, 0, 0).toISOString() },
    { check_time: schoolInstant(2026, 9, 23, 12, 45, 0).toISOString() },
    { check_time: schoolInstant(2026, 9, 23, 18, 0, 0).toISOString() }
  ];
  assert.equal(L.getPunchLabel(logs, 0), 'entry');
  assert.equal(L.getPunchLabel(logs, 1), 'lunch_in');
  assert.equal(L.getPunchLabel(logs, 2), 'lunch_out');
  assert.equal(L.getPunchLabel(logs, 3), 'exit');
});

test('formatLateMinutes formatea horas y minutos', () => {
  assert.equal(L.formatLateMinutes(0), '0 min');
  assert.equal(L.formatLateMinutes(45), '45 min');
  assert.equal(L.formatLateMinutes(120), '2 h 00 min');
  assert.equal(L.formatLateMinutes(125), '2 h 05 min');
});

const at = (h, m, s = 0) => schoolInstant(2026, 9, 23, h, m, s).toISOString();

test('getWorkedMinutes es la permanencia del día (última − primera)', () => {
  assert.equal(L.getWorkedMinutes([at(7, 30), at(13, 0)]), 330);
  assert.equal(L.getWorkedMinutes([at(7, 30), at(12, 0), at(12, 45), at(18, 0)]), 630);
  const blocks = [at(7, 30), at(9, 0), at(9, 10), at(10, 30), at(10, 40), at(12, 0)];
  assert.equal(L.getWorkedMinutes(blocks), 270);
  assert.equal(L.getWorkedMinutes([at(7, 30)]), null);
  assert.equal(L.getWorkedMinutes([]), null);
  assert.equal(L.getWorkedMinutes([at(6, 0), at(23, 0)]), null);
  assert.equal(L.getWorkedMinutes([at(7, 30), at(7, 30), at(13, 0)]), 330);
});

test('getWorkedMinutes no descuenta descansos (solo la permanencia)', () => {
  const lunch = [at(7, 30), at(12, 0), at(12, 45), at(18, 0)];
  assert.equal(L.getWorkedMinutes(lunch), 630);
  assert.equal(L.getWorkedMinutes(lunch, { breakThresholdMinutes: 45 }), 630);
});

test('getExtraMinutes mide lo que se pasa de la hora de salida', () => {
  const sched = { lateMinutes: 7 * 60, endMinutes: 17 * 60, days: [1, 2, 3, 4, 5], offDates: [] };
  const marks = [at(7, 30), at(17, 30)];
  assert.equal(L.getExtraMinutes(marks, sched, SETTINGS), 30);
  assert.equal(L.getExtraMinutes([at(7, 30), at(16, 0)], sched, SETTINGS), 0);
  // Sin saída registrada no hay horas extra que contar.
  assert.equal(L.getExtraMinutes([at(7, 30)], sched, SETTINGS), 0);
  // Con la config general (18:00 en SETTINGS) 18:30 son 30 min extra.
  assert.equal(L.getExtraMinutes([at(7, 30), at(18, 30)], null, SETTINGS), 30);
});

test('getExpectedWorkMinutes usa el turno propio o el general', () => {
  const sched = { lateMinutes: 7 * 60 + 30, endMinutes: 16 * 60, days: [1, 2, 3, 4, 5], offDates: [] };
  assert.equal(L.getExpectedWorkMinutes(sched, SETTINGS), 8 * 60 + 30);
  assert.equal(L.getExpectedWorkMinutes(null, SETTINGS), 10 * 60); // 08:00-18:00
  assert.equal(L.getExpectedWorkMinutes({ lateMinutes: 600, endMinutes: 500 }, SETTINGS), null);
});

test('splitAbsencesByExcuse separa justificadas de injustificadas', () => {
  const r = L.splitAbsencesByExcuse(['2026-09-21', '2026-09-22', '2026-09-23'], ['2026-09-22']);
  assert.deepEqual(r.justified, ['2026-09-22']);
  assert.deepEqual(r.unjustified, ['2026-09-21', '2026-09-23']);
});

test('buildPayrollSummary.totaliza días, horas, extra y justificaciones', () => {
  const days = [
    { date: '2026-09-21', status: 'on-time', lateMinutes: 0, marks: [at(7, 30), at(17, 0)] },
    { date: '2026-09-22', status: 'late', lateMinutes: 10, marks: [at(7, 40), at(17, 40)] },
    { date: '2026-09-23', status: 'on-time', lateMinutes: 0, marks: [at(7, 35), at(17, 5)] }
  ];
  const p = L.buildPayrollSummary({
    days,
    absentDays: ['2026-09-24', '2026-09-25'],
    excuses: [{ day: '2026-09-24', excuseType: 'licencia' }, { day: '2026-09-22', excuseType: 'permiso' }],
    expectedDays: 5,
    schedule: { lateMinutes: 7 * 60 + 30, endMinutes: 17 * 60, days: [1, 2, 3, 4, 5], offDates: [], shift: 'manana' },
    settings: { ...SETTINGS, workBreakThresholdMinutes: 30 }
  });

  assert.equal(p.days.length, 3);
  assert.equal(p.expectedDays, 5);
  assert.equal(p.workedDays, 3);
  assert.equal(p.workedMinutes, 1740);
  assert.equal(p.workedTime, '29 h 00 min');
  assert.equal(p.workedHours, 29);
  assert.equal(p.extraMinutes, 45);
  assert.equal(p.extraTime, '45 min');
  assert.equal(p.lateMinutesTotal, 10);
  assert.equal(p.lateMinutesExcused, 10);
  assert.equal(p.lateMinutesCharged, 0);
  assert.deepEqual(p.absentJustifiedDays, ['2026-09-24']);
  assert.deepEqual(p.absentUnjustifiedDays, ['2026-09-25']);
  assert.equal(p.compliancePct, 61);
  assert.equal(p.shift, 'manana');
  assert.equal(p.days[1].excused, true);
  assert.equal(p.days[1].excuseLabel, 'Permiso');
  assert.equal(p.days[0].excused, false);
});

test('buildPayrollSummary: coversLate decide si exonera la tardanza', () => {
  const days = [
    { date: '2026-09-21', status: 'late', lateMinutes: 7, marks: [at(7, 37), at(17, 0)] },
    { date: '2026-09-22', status: 'late', lateMinutes: 12, marks: [at(7, 42), at(17, 0)] }
  ];
  const p = L.buildPayrollSummary({
    days,
    absentDays: [],
    excuses: [
      { day: '2026-09-21', excuseType: 'licencia', coversLate: true },
      { day: '2026-09-22', excuseType: 'vacaciones', coversLate: false }
    ],
    expectedDays: 2,
    schedule: { lateMinutes: 450, endMinutes: 1020, days: [1, 2, 3, 4, 5], offDates: [] },
    settings: SETTINGS
  });

  assert.equal(p.excused, undefined);
  assert.equal(p.lateMinutesExcused, 7);
  assert.equal(p.lateMinutesCharged, 12);
  assert.deepEqual(p.excusedLateDays, ['2026-09-21']);
  assert.equal(p.days[1].excused, true);
  assert.equal(p.days[1].excuseCoversLate, false);
});

test('normalizeShift/getShiftLabel y normalización de tipos de justificación', () => {
  assert.equal(L.normalizeShift('MAÑANA'), 'manana');
  assert.equal(L.normalizeShift('rotativo'), null);
  assert.equal(L.getShiftLabel('tarde'), 'Tarde');
  assert.equal(L.normalizeExcuseType('Licencia'), 'licencia');
  assert.equal(L.normalizeExcuseType('inventado'), 'otro');
  assert.equal(L.getExcuseLabel('comision'), 'Comisión de servicio');
  assert.equal(L.minutesToDecimalHours(135), 2.3);
});
