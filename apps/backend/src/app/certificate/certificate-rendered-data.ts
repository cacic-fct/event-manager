import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { Prisma } from '@prisma/client';
import { CertificateConfigRecord, EventRecord } from './certificate.constants';
import { EligibleCertificateRecipient } from './certificate-eligibility.service';

const LECTURER_EVENT_CATEGORY_FIELD = '__lecturerEventCategory';

type LecturerEventCategory = 'PALESTRA' | 'MINICURSO' | 'OTHER';

export function buildCertificateRenderedData(
  config: CertificateConfigRecord,
  recipient: EligibleCertificateRecipient,
  issuedAt: Date,
): Prisma.InputJsonObject {
  const events = sortEvents(recipient.events);
  const totalCreditMinutes = events.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
  const target = resolveTarget(config);
  const targetName = target?.name ?? '';

  return {
    scope: config.scope,
    issuedTo: config.issuedTo,
    configId: config.id,
    configName: config.name,
    configText: config.certificateText ?? null,
    certificateTypeLabel: buildCertificateTypeLabel(config),
    shouldAutofillSecondPage: config.shouldAutofillSecondPage,
    secondPageText: config.secondPageText ?? null,
    person: {
      id: recipient.person.id,
      name: recipient.person.name,
      email: recipient.person.email ?? null,
      identityDocument: recipient.person.identityDocument ?? null,
      academicId: recipient.person.academicId ?? null,
    },
    target: target ? { id: target.id, name: target.name } : null,
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      creditMinutes: event.creditMinutes ?? null,
      type: event.type,
      eventGroupId: event.eventGroupId ?? null,
      eventGroupName: event.eventGroup?.name ?? null,
    })),
    totalCreditMinutes,
    totalCreditHours: totalCreditMinutes / 60,
    templateData: buildExampleTemplateData(config, recipient, targetName, issuedAt),
  };
}

export function hasSameJson(
  left: Prisma.JsonValue | Prisma.InputJsonValue,
  right: Prisma.JsonValue | Prisma.InputJsonValue | null,
): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function resolveTarget(config: CertificateConfigRecord) {
  switch (config.scope) {
    case CertificateScope.EVENT:
      return config.event;
    case CertificateScope.EVENT_GROUP:
      return config.eventGroup;
    case CertificateScope.MAJOR_EVENT:
      return config.majorEvent;
    case CertificateScope.OTHER:
      return config.folder;
  }
}

function stableJsonStringify(value: Prisma.JsonValue | Prisma.InputJsonValue | null): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }

  return `{${Object.entries(value)
    .sort()
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJsonStringify(child)}`)
    .join(',')}}`;
}

function buildExampleTemplateData(
  config: CertificateConfigRecord,
  recipient: EligibleCertificateRecipient,
  targetName: string,
  issuedAt: Date,
): Prisma.InputJsonObject {
  const issueDay = formatIssueDate(issuedAt, '2-digit');
  const issueMonth = formatIssueDate(issuedAt, 'long');
  const issueYear = formatIssueDate(issuedAt, 'numeric');
  const verificationUrl = 'eventos.cacic.com.br/app/validate/{certificateID}';
  const formattedDocument = formatIdentityDocument(recipient.person.identityDocument);
  const sortedEvents = sortEvents(recipient.events);
  const minicursos = sortedEvents.filter((event) => event.type === EventType.MINICURSO);
  const palestras = sortedEvents.filter((event) => event.type === EventType.PALESTRA);
  const otherEvents = sortedEvents.filter(
    (event) => event.type !== EventType.MINICURSO && event.type !== EventType.PALESTRA,
  );
  const sections = {
    minicursos: buildEventSection('Minicursos:', buildMinicursoLines(minicursos), minicursos),
    palestras: buildEventSection('Palestras:', buildSingleEventLines(palestras), palestras),
    other: buildEventSection('', buildSingleEventLines(otherEvents), otherEvents),
  };
  const contentLines = [
    ...contentSectionLines(sections.minicursos),
    ...contentSectionLines(sections.palestras),
    ...contentSectionLines(sections.other),
    'Observações:',
    'Datas em formato "dia/mês/ano".',
  ];
  const secondPageEventContent = [sections.minicursos.text, sections.palestras.text, sections.other.text, 'Observações:', 'Datas em formato "dia/mês/ano".']
    .filter((line) => line.trim().length > 0)
    .join('\n\n');
  const certificateTypeLabel = buildCertificateTypeLabel(config);

  return {
    issue_day: issueDay,
    issue_month: issueMonth,
    issue_year: issueYear,
    'top-text': getCertificateFieldValue(
      config.certificateFields,
      'top-text',
      config.certificateTemplate?.certificateFields ?? null,
      'Certificamos a participação de',
    ),
    'bottom-text': getCertificateFieldValue(
      config.certificateFields,
      'bottom-text',
      config.certificateTemplate?.certificateFields ?? null,
      'no evento',
    ),
    date: `${issueDay} de ${issueMonth} de ${issueYear}`,
    participation_type: buildParticipationType(config),
    name: recipient.person.name,
    event_type: 'no evento',
    major_event_or_event_name: targetName,
    event_name: targetName,
    'majorEvent or event name': targetName,
    additional_text: config.certificateText ?? '',
    qrcode: verificationUrl,
    url: verificationUrl,
    identity_document: formattedDocument,
    identityDocument: formattedDocument,
    certificate_type: certificateTypeLabel,
    certificateType: certificateTypeLabel,
    certificateID: '{certificateID}',
    name_small: recipient.person.name,
    document: `Documento: ${formattedDocument}`,
    event_name_small: targetName,
    content: contentLines.join('\n'),
    second_page_content: config.shouldAutofillSecondPage ? secondPageEventContent : (config.secondPageText?.trim() ?? ''),
    minicursosSection: sections.minicursos.text,
    palestrasSection: sections.palestras.text,
    otherEventTypesList: sections.other.text,
  };
}

function sortEvents(events: EventRecord[]): EventRecord[] {
  return [...events].sort(
    (left, right) => left.startDate.getTime() - right.startDate.getTime() || left.id.localeCompare(right.id),
  );
}

function formatIssueDate(date: Date, month: '2-digit' | 'long' | 'numeric'): string {
  if (month === '2-digit') {
    return new Intl.DateTimeFormat('pt-BR', { day: month }).format(date);
  }
  if (month === 'long') {
    return new Intl.DateTimeFormat('pt-BR', { month }).format(date);
  }
  return new Intl.DateTimeFormat('pt-BR', { year: month }).format(date);
}

function buildEventSection(label: string, lines: string[], events: EventRecord[]) {
  if (lines.length === 0) {
    return { text: '', lines: [] as string[] };
  }

  const totalMinutes = events.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
  const endedLines = applyBulletLineEndings(lines);
  const totalLine = `Carga horária total: ${formatCargaHoraria(totalMinutes)}.`;
  return {
    text: `${label ? `${label}\n` : ''}${endedLines.join('\n')}\n${totalLine}`,
    lines: label ? [label, ...endedLines, totalLine, ''] : [...endedLines, totalLine, ''],
  };
}

function contentSectionLines(section: { lines: string[] }): string[] {
  return section.lines;
}

function getCertificateFieldValue(
  customFields: Prisma.JsonValue | null,
  key: string,
  templateFields: Prisma.JsonValue | null,
  fallback: string,
): string {
  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    const value = customFields[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  if (templateFields && typeof templateFields === 'object' && !Array.isArray(templateFields)) {
    const value = normalizeCertificateFieldValue(templateFields[key]);
    if (value) {
      return value;
    }
  }

  return fallback;
}

function normalizeCertificateFieldValue(value: Prisma.JsonValue | undefined): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const defaultValue = value.default;
  if (typeof defaultValue === 'string') {
    return defaultValue.trim() || null;
  }
  return typeof defaultValue === 'number' || typeof defaultValue === 'boolean' ? String(defaultValue) : null;
}

function buildParticipationType(config: CertificateConfigRecord): string {
  if (config.issuedTo !== CertificateIssuedTo.LECTURER) {
    return 'Certificamos a participação de:';
  }

  switch (parseLecturerEventCategory(config.certificateFields)) {
    case 'PALESTRA':
      return 'Certificamos a participação como palestrante de:';
    case 'MINICURSO':
      return 'Certificamos a participação como ministrante de:';
    case 'OTHER':
      return 'Certificamos a participação como palestrante/ministrante de:';
    default:
      return 'Certificamos a participação como palestrante de:';
  }
}

function buildCertificateTypeLabel(config: CertificateConfigRecord): string {
  const customLabel = config.certificateTypeLabel?.trim();
  if (config.issuedTo === CertificateIssuedTo.ATTENDEE) {
    return 'Participação';
  }
  if (config.issuedTo !== CertificateIssuedTo.LECTURER) {
    return customLabel || 'Manual';
  }

  switch (parseLecturerEventCategory(config.certificateFields)) {
    case 'PALESTRA':
      return 'Palestrante';
    case 'MINICURSO':
      return 'Ministrante';
    default:
      return customLabel || 'Palestrante/ministrante';
  }
}

function parseLecturerEventCategory(certificateFields: Prisma.JsonValue | null): LecturerEventCategory | null {
  if (!certificateFields || typeof certificateFields !== 'object' || Array.isArray(certificateFields)) {
    return null;
  }

  const value = certificateFields[LECTURER_EVENT_CATEGORY_FIELD];
  return value === 'PALESTRA' || value === 'MINICURSO' || value === 'OTHER' ? value : null;
}

export function buildMinicursoLines(events: EventRecord[]): string[] {
  const groups = new Map<string, { label: string; events: EventRecord[]; hasGroup: boolean }>();
  for (const event of events) {
    const key = event.eventGroupId ?? event.id;
    const group = groups.get(key);
    if (group) {
      group.events.push(event);
    } else {
      groups.set(key, {
        label: event.eventGroup?.name ?? event.name,
        events: [event],
        hasGroup: Boolean(event.eventGroupId),
      });
    }
  }

  return [...groups.values()]
    .sort((left, right) => (left.events[0]?.startDate.getTime() ?? 0) - (right.events[0]?.startDate.getTime() ?? 0))
    .map((group) => {
      const groupEvents = [...group.events].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
      const totalMinutes = groupEvents.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
      if (groupEvents.length === 1 && !group.hasGroup) {
        const event = groupEvents[0];
        return `• ${formatDate(event.startDate)} - ${event.name} - Carga horária: ${formatCargaHoraria(totalMinutes)}`;
      }
      return `• ${groupEvents.map((event) => formatDate(event.startDate)).join(', ')} - ${group.label} - Carga horária: ${formatCargaHoraria(totalMinutes)}`;
    });
}

function buildSingleEventLines(events: EventRecord[]): string[] {
  return events.map(
    (event) => `• ${formatDate(event.startDate)} - ${event.name} - Carga horária: ${formatCargaHoraria(event.creditMinutes ?? 0)}`,
  );
}

function applyBulletLineEndings(lines: string[]): string[] {
  return lines.map((line, index) => `${line}${index === lines.length - 1 ? '.' : ';'}`);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatCargaHoraria(totalMinutes: number): string {
  if (totalMinutes === 0) return '0 minutos';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  if (minutes === 0) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} e ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

function formatIdentityDocument(identityDocument?: string | null): string {
  const trimmedDocument = identityDocument?.trim();
  if (!trimmedDocument) return '';
  const digits = trimmedDocument.replace(/\D/g, '');
  return digits.length === 11 ? `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••` : trimmedDocument;
}
