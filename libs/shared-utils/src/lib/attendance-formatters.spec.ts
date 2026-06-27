import type { PublicEvent, PublicEventGroup } from '@cacic-fct/event-manager-public-contracts';
import {
  formatCreditMinutes,
  formatDateRange,
  formatEventsDateRange,
  formatStatusLine,
  getEventGroupCertificateLabel,
  isOnlineAttendanceRegistrationOpen,
  joinUnique,
} from './attendance-formatters';
import { formatCPF, isValidCPF, unformatCPF } from './cpf';
import { formatUnespRole } from './unesp-role-formatters';

describe('attendance formatters', () => {
  it('formats same-day and multi-day date ranges for the Portuguese UI', () => {
    expect(formatDateRange('2026-06-26T09:00:00', '2026-06-26T11:30:00')).toBe(
      '26/06/2026, 09:00-11:30',
    );
    expect(formatDateRange('2026-06-26T22:00:00', '2026-06-27T01:30:00')).toBe(
      '26/06/2026, 22:00 - 27/06/2026, 01:30',
    );
  });

  it('falls back when an event collection has no dates and otherwise spans first to last event', () => {
    expect(formatEventsDateRange([])).toBe('Datas a confirmar');
    expect(
      formatEventsDateRange([
        event('first', '2026-06-26T09:00:00', { endDate: '2026-06-26T10:00:00' }),
        event('last', '2026-06-27T11:00:00', { endDate: '2026-06-27T12:00:00' }),
      ]),
    ).toBe(
      '26/06/2026, 09:00 - 27/06/2026, 12:00',
    );
  });

  it('opens online attendance only inside the configured collection window', () => {
    const baseEvent = event('event-1', '2026-06-26T09:00:00', {
      shouldCollectAttendance: true,
      isOnlineAttendanceAllowed: true,
      onlineAttendanceStartDate: '2026-06-26T08:50:00',
      onlineAttendanceEndDate: '2026-06-26T11:10:00',
    });

    expect(isOnlineAttendanceRegistrationOpen(baseEvent, new Date('2026-06-26T09:30:00'))).toBe(true);
    expect(isOnlineAttendanceRegistrationOpen(baseEvent, new Date('2026-06-26T08:49:59'))).toBe(false);
    expect(isOnlineAttendanceRegistrationOpen({ ...baseEvent, shouldCollectAttendance: false })).toBe(false);
  });

  it('deduplicates status and free-text lines without losing order', () => {
    expect(formatStatusLine(['Inscrito', undefined, 'Inscrito', 'Palestrante'])).toBe('Inscrito, Palestrante');
    expect(formatStatusLine([undefined])).toBe('Sem inscrição');
    expect(joinUnique([' Sala 1 ', '', 'Sala 1', 'Auditório'])).toBe('Sala 1\nAuditório');
  });

  it('formats certificates, credit hours, CPF, and UNESP roles', () => {
    expect(formatCreditMinutes(45)).toBe('45 min');
    expect(formatCreditMinutes(90)).toBe('1,5 h');
    expect(getEventGroupCertificateLabel(group({ shouldIssueCertificate: false }))).toBe('Não emite certificados');
    expect(getEventGroupCertificateLabel(group({ shouldIssueCertificate: true }))).toBe('Certificado único do grupo');
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
    expect(unformatCPF('529.982.247-25')).toBe('52998224725');
    expect(formatUnespRole('aluno-graduacao', '001234')).toBe('Aluno de Ciência da Computação');
    expect(formatUnespRole(['professor'])).toBe('Professor');
  });
});

function event(id: string, startDate: string, overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate: addOneHour(startDate),
    emoji: '📌',
    type: 'OTHER',
    ...overrides,
  };
}

function group(overrides: Partial<PublicEventGroup>): PublicEventGroup {
  return {
    id: 'group-1',
    name: 'Grupo',
    emoji: '📁',
    ...overrides,
  };
}

function addOneHour(value: string): string {
  const [date, time] = value.split('T');
  const hour = Number(time.slice(0, 2)) + 1;

  return `${date}T${String(hour).padStart(2, '0')}${time.slice(2)}`;
}
