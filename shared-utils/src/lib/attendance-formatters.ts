import { compareAsc, format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import {
  CurrentUserEventAttendance,
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
} from './attendance-models';

export function compareIsoDateAsc(leftDate: string, rightDate: string): number {
  return compareAsc(parseISO(leftDate), parseISO(rightDate));
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (isSameDay(start, end)) {
    return `${formatDay(startDate)}, ${formatTime(startDate)}-${formatTime(
      endDate,
    )}`;
  }

  return `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`;
}

export function formatEventsDateRange(events: PublicEvent[]): string {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  if (!firstEvent || !lastEvent) {
    return 'Datas a confirmar';
  }

  return formatDateRange(firstEvent.startDate, lastEvent.endDate);
}

export function formatDateTime(date: string): string {
  return format(parseISO(date), 'dd/MM/yyyy, HH:mm', { locale: ptBR });
}

export function formatDay(date: string): string {
  return format(parseISO(date), 'dd/MM/yyyy', { locale: ptBR });
}

export function formatTime(date: string): string {
  return format(parseISO(date), 'HH:mm', { locale: ptBR });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatCreditMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;
  return `${hours.toLocaleString('pt-BR')} h`;
}

export function getEventTypeLabel(type: string): string {
  switch (type) {
    case 'MINICURSO':
      return 'Minicurso';
    case 'PALESTRA':
      return 'Palestra';
    default:
      return 'Evento';
  }
}

export function getSubscriptionStatusLabel(status: string): string {
  switch (status) {
    case 'WAITING_RECEIPT_UPLOAD':
      return 'Aguardando envio de comprovante';
    case 'RECEIPT_UNDER_REVIEW':
      return 'Comprovante em análise';
    case 'CONFIRMED':
      return 'Inscrição confirmada';
    case 'REJECTED_INVALID_RECEIPT':
      return 'Comprovante inválido';
    case 'REJECTED_NO_SLOTS':
      return 'Sem vagas';
    case 'REJECTED_SCHEDULE_CONFLICT':
      return 'Conflito de horário';
    case 'REJECTED_GENERIC':
      return 'Inscrição rejeitada';
    case 'CANCELED':
      return 'Inscrição cancelada';
    default:
      return status;
  }
}

export const SUBSCRIPTION_STATUS_VALUES = [
  'WAITING_RECEIPT_UPLOAD',
  'RECEIPT_UNDER_REVIEW',
  'REJECTED_INVALID_RECEIPT',
  'REJECTED_NO_SLOTS',
  'REJECTED_SCHEDULE_CONFLICT',
  'REJECTED_GENERIC',
  'CONFIRMED',
  'CANCELED',
] as const;

export function getContactLabel(
  contactType: PublicMajorEvent['contactType'],
): string {
  switch (contactType) {
    case 'EMAIL':
      return 'E-mail';
    case 'PHONE':
      return 'Telefone';
    case 'WHATSAPP':
      return 'WhatsApp';
    default:
      return 'Contato';
  }
}

export function getEventGroupCertificateLabel(group: PublicEventGroup): string {
  if (group.shouldIssueCertificateForEachEvent) {
    return 'Um certificado por evento';
  }

  if (group.shouldIssuePartialCertificate) {
    return 'Certificado parcial disponível';
  }

  return 'Não emite certificados';
}

export function isOnlineAttendanceRegistrationOpen(
  event: PublicEvent,
  now = new Date(),
): boolean {
  if (!event.shouldCollectAttendance || !event.isOnlineAttendanceAllowed) {
    return false;
  }

  const startsInTime =
    !event.onlineAttendanceStartDate ||
    compareAsc(now, parseISO(event.onlineAttendanceStartDate)) >= 0;
  const endsInTime =
    !event.onlineAttendanceEndDate ||
    compareAsc(now, parseISO(event.onlineAttendanceEndDate)) <= 0;

  return startsInTime && endsInTime;
}

export function getAttendanceByEventId(
  attendances: CurrentUserEventAttendance[],
): Map<string, CurrentUserEventAttendance> {
  return new Map(
    attendances.map((attendance) => [attendance.eventId, attendance]),
  );
}

export function joinUnique(values: string[]): string | undefined {
  const uniqueValues = [...new Set(values.map((value) => value.trim()))].filter(
    (value) => value.length > 0,
  );

  return uniqueValues.length > 0 ? uniqueValues.join('\n') : undefined;
}
