import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapEventAttendances as mapSecompp1Attendances,
  mapEventSeeds,
  mapMajorEventSubscriptions as mapSecompp1Subscriptions,
  mapMajorEvents,
  mapPeople as mapSecompp1People,
  parseArgs as parseSecompp1Args,
} from './secompp-to-postgres.mts';
import {
  buildEventRows as buildSecompp2EventRows,
  buildMajorEventRows,
  mapEventAttendances as mapSecompp2Attendances,
  mapMajorEventIds,
  mapMinicursos,
  mapPalestras,
  mapPeople as mapSecompp2People,
  parseArgs as parseSecompp2Args,
} from './secompp2-to-postgres.mts';

const now = new Date('2026-08-16T00:00:00.000Z');

test('preserves CLI help and inline database URLs containing equals signs', () => {
  assert.equal(parseSecompp1Args(['--help']).help, true);
  assert.equal(parseSecompp2Args(['-h']).help, true);
  assert.equal(
    parseSecompp1Args(['--database-url=postgresql://db/app?sslmode=require&x=a=b']).databaseUrl,
    'postgresql://db/app?sslmode=require&x=a=b',
  );
});

test('maps SECOMPP 1 parent, child, people, subscriptions, and attendance', () => {
  const { majorEvents, majorEventIdByLegacy, majorEventStartByLegacy } = mapMajorEvents(
    [
      {
        idEvent: 10,
        name: 'Evento',
        start: '2026-08-16',
        end: '2026-08-17',
        location: 'Sala',
        link: null,
        description: '<b>Desc</b>',
      },
    ],
    now,
  );
  const { lectureSeeds, shortcourseSeeds } = mapEventSeeds(
    [{ idLecture: 2, idEventFK: 10, name: 'Palestra', description: '<p>Texto</p>' }],
    [{ idShortcourse: 3, idEventFK: 10, name: 'Curso', description: '<p>Curso</p>', workload: '2', vacancies: '20' }],
    majorEventIdByLegacy,
    majorEventStartByLegacy,
    now,
  );
  const { people, userIdToPersonId } = mapSecompp1People(
    [{ idDetail: 7, cpf: '123.456.789-01', name: 'ANA DA SILVA' }],
    [{ idUser: 8, idDetailFK: 7, email: ' ANA@EXAMPLE.COM ' }],
    now,
  );
  const subscriptionResult = mapSecompp1Subscriptions(
    [{ idUserFK: 8, idEventFK: 10, amount: 50, status: 'S' }],
    userIdToPersonId,
    majorEventIdByLegacy,
    majorEventStartByLegacy,
  );
  const attendanceResult = mapSecompp1Attendances(
    [{ idUserFK: 8, idLectureFK: 2 }],
    [{ idUserFK: 8, idShortcourseFK: 3 }],
    userIdToPersonId,
    lectureSeeds,
    shortcourseSeeds,
    now,
  );

  const majorEvent = requireValue(majorEvents[0]);
  const person = requireValue(people[0]);
  const majorSubscription = requireValue(subscriptionResult.majorEventSubscriptions[0]);
  assert.equal(majorEvent.id, 'SYSCOMPP-1-major-event-10');
  assert.equal(person.name, 'Ana da Silva');
  assert.equal(person.email, 'ana@example.com');
  assert.equal(majorSubscription.subscriptionStatus, 'CONFIRMED');
  assert.equal(subscriptionResult.paidByMajorEvent.get(majorEvent.id), true);
  assert.equal(attendanceResult.eventAttendances.length, 2);
  assert.equal(attendanceResult.skippedAttendances, 0);
});

test('maps SECOMPP 2 temporal fields, placeholder people, and parent ranges', () => {
  const majorEventIdByYearRef = mapMajorEventIds([{ idAno_Referencia: 4, ano: 2025 }]);
  const minicursos = mapMinicursos(
    [
      {
        idMinicurso: 9,
        idAno_ReferenciaFK: 4,
        data: '2025-10-03',
        hora_inicio: '14:00',
        hora_termino: '16:30',
        nome: 'Curso',
        descricao: null,
        cargahoraria: 2,
        vagas: 10,
        local: 'Lab',
        create_time: '2025-09-01 10:00:00',
      },
    ],
    majorEventIdByYearRef,
    now,
  );
  const palestras = mapPalestras(
    [
      {
        idPalestra: 5,
        idAno_ReferenciaFK: 4,
        data: '2025-10-04',
        hora_inicio: '09:00:00',
        hora_termino: '10:00:00',
        nome: 'Talk',
        descricao: null,
        local: null,
        CPFusuarioFK: '98765432100',
        create_time: null,
      },
    ],
    majorEventIdByYearRef,
    now,
  );
  const events = buildSecompp2EventRows(
    minicursos,
    palestras,
    new Map([
      ['MINICURSO', 'group-course'],
      ['PALESTRA', 'group-talk'],
    ]),
    now,
  );
  const majorEvents = buildMajorEventRows(
    [{ idAno_Referencia: 4, ano: 2025, create_time: null }],
    majorEventIdByYearRef,
    events,
    new Map(),
    now,
  );
  const { people, cpfToPersonId } = mapSecompp2People([], new Set(['98765432100']), now);
  const attendanceResult = mapSecompp2Attendances(
    [{ CPFusuarioFK: '98765432100', idMinicursoFK: 9, presenca: 1, create_time: '2025-10-03 16:40:00' }],
    cpfToPersonId,
    minicursos,
    now,
  );

  const minicurso = requireValue(minicursos.get(9));
  const palestra = requireValue(palestras.get(5));
  const majorEvent = requireValue(majorEvents[0]);
  const attendance = requireValue(attendanceResult.eventAttendances[0]);
  assert.equal(minicurso.startDate.toISOString(), '2025-10-03T14:00:00.000Z');
  assert.equal(minicurso.endDate.toISOString(), '2025-10-03T16:30:00.000Z');
  assert.equal(palestra.speakerCpf, '98765432100');
  assert.equal(majorEvent.startDate.toISOString(), '2025-10-03T14:00:00.000Z');
  assert.equal(majorEvent.endDate.toISOString(), '2025-10-04T10:00:00.000Z');
  assert.equal(people.length, 1);
  assert.equal(attendance.attendedAt.toISOString(), '2025-10-03T16:40:00.000Z');
});

function requireValue<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}
