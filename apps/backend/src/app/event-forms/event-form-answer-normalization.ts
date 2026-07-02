import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FORM_ELEMENT_TYPES,
  isFormAnswerElementType,
  normalizeFormResponseAnswers,
  type FormAnswerValue,
  type FormChoiceOption,
  type FormElement,
  type FormResponseAnswer,
  type FormSchedulingAnswer,
} from '@cacic-fct/form-contracts';

export function parseElementsJson(value: string): FormElement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException('JSON dos itens do formulário inválido.');
  }

  if (!Array.isArray(parsed)) {
    throw new BadRequestException('Itens do formulário devem ser uma lista.');
  }

  return parsed.map((item, index) => normalizeElement(item, index));
}

export function normalizeAnswers(
  answersJson: string,
  elements: readonly FormElement[],
  enforceRequiredAnswers: boolean,
): FormResponseAnswer[] {
  const answers = parseAnswersJson(answersJson);
  const normalized = normalizeFormResponseAnswers(answers);
  const answerElements = elements.filter((element) => isFormAnswerElementType(element.type));
  const elementsById = new Map(answerElements.map((element) => [element.id, element]));
  const answersById = new Map(normalized.map((answer) => [answer.elementId, answer.value]));

  for (const answer of normalized) {
    const element = elementsById.get(answer.elementId);
    if (!element) {
      throw new BadRequestException(`Resposta enviada para item desconhecido: ${answer.elementId}.`);
    }
    answersById.set(answer.elementId, normalizeAnswerValue(element, answer.value));
  }

  if (enforceRequiredAnswers) {
    for (const element of answerElements) {
      if (element.required && isMissingRequiredAnswer(element, answersById.get(element.id) ?? null)) {
        throw new BadRequestException(`A pergunta "${element.title}" é obrigatória.`);
      }
    }
  }

  return [...answersById.entries()].map(([elementId, value]) => ({ elementId, value }));
}

export function parseAnswersJson(value: string): FormResponseAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException('JSON das respostas inválido.');
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('Respostas devem ser uma lista.');
  }
  return parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      elementId: stringValue(item['elementId']),
      value: item['value'] as FormAnswerValue,
    }))
    .filter((answer) => answer.elementId);
}

export function assertStoredResponseHasCurrentRequiredAnswers(
  form: { name: string; elements: Prisma.JsonValue },
  answersValue: Prisma.JsonValue,
): void {
  const elements = Array.isArray(form.elements) ? (form.elements as unknown as FormElement[]) : [];
  const answerElements = elements.filter((element) => isFormAnswerElementType(element.type));
  const answers = Array.isArray(answersValue)
    ? normalizeFormResponseAnswers(answersValue as unknown as FormResponseAnswer[])
    : [];
  const answersById = new Map(answers.map((answer) => [answer.elementId, answer.value]));

  for (const element of answerElements) {
    if (element.required && isMissingRequiredAnswer(element, answersById.get(element.id) ?? null)) {
      throw new BadRequestException(`Responda o formulário obrigatório "${form.name}" para concluir a inscrição.`);
    }
  }
}

export function isEmptyAnswer(value: FormAnswerValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeElement(value: unknown, index: number): FormElement {
  if (!isRecord(value)) {
    throw new BadRequestException(`Item ${index + 1} do formulário é inválido.`);
  }

  const type = value['type'];
  if (typeof type !== 'string' || !(FORM_ELEMENT_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException(`Tipo do item ${index + 1} do formulário é inválido.`);
  }

  const id = stringValue(value['id']) || `element-${index + 1}`;
  const title = stringValue(value['title']) || defaultTitle(type);
  const options = Array.isArray(value['options']) ? value['options'].map((option, optionIndex) => normalizeOption(option, optionIndex)) : [];

  return {
    id,
    type,
    title,
    description: stringValue(value['description']) || undefined,
    descriptionImages: [],
    required: Boolean(value['required']),
    options,
    settings: isRecord(value['settings']) ? value['settings'] : undefined,
  } as FormElement;
}

function normalizeOption(value: unknown, index: number): FormChoiceOption {
  if (!isRecord(value)) {
    return {
      id: `option-${index + 1}`,
      label: `Opção ${index + 1}`,
    };
  }
  return {
    id: stringValue(value['id']) || `option-${index + 1}`,
    label: stringValue(value['label']) || `Opção ${index + 1}`,
    description: stringValue(value['description']) || undefined,
  };
}

function normalizeAnswerValue(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  switch (element.type) {
    case 'shortText':
    case 'longText':
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    case 'date':
      return normalizeDateAnswer(element, value);
    case 'time':
      return normalizeTimeAnswer(element, value);
    case 'singleChoice':
    case 'selectionDropdown':
      return normalizeChoiceAnswer(element, value);
    case 'multipleChoice':
      return normalizeMultipleChoiceAnswer(element, value);
    case 'linearScale':
      return normalizeLinearScaleAnswer(element, value);
    case 'starRating':
      return normalizeStarRatingAnswer(element, value);
    case 'singleSelectionGrid':
      return normalizeGridAnswer(element, value, false);
    case 'multipleSelectionGrid':
      return normalizeGridAnswer(element, value, true);
    case 'scheduling':
      return normalizeSchedulingAnswer(element, value);
    default:
      return null;
  }
}

function normalizeChoiceAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!optionIds(element).has(normalized)) {
    throw new BadRequestException(`Opção inválida para a pergunta "${element.title}".`);
  }
  return normalized;
}

function normalizeMultipleChoiceAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids = optionIds(element);
  const normalized = [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
  const invalid = normalized.find((item) => !ids.has(item));
  if (invalid) {
    throw new BadRequestException(`Opção inválida para a pergunta "${element.title}".`);
  }
  return normalized.length > 0 ? normalized : null;
}

function normalizeDateAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!isValidIsoDate(normalized)) {
    throw new BadRequestException(`Data inválida para a pergunta "${element.title}".`);
  }
  return normalized;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(0, month - 1, day));
  date.setUTCFullYear(year);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeTimeAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  const hour = match ? Number(match[1]) : Number.NaN;
  const minute = match ? Number(match[2]) : Number.NaN;
  if (!match || hour > 23 || minute > 59) {
    throw new BadRequestException(`Hora inválida para a pergunta "${element.title}".`);
  }
  return normalized;
}

function normalizeLinearScaleAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  const min = element.settings?.linearScale?.min ?? 1;
  const max = element.settings?.linearScale?.max ?? 5;
  if (value < min || value > max) {
    throw new BadRequestException(`Valor fora da escala da pergunta "${element.title}".`);
  }
  return value;
}

function normalizeStarRatingAnswer(element: FormElement, value: FormAnswerValue): FormAnswerValue {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  const max = element.settings?.starRating?.max ?? 5;
  if (value < 1 || value > max) {
    throw new BadRequestException(`Valor fora da avaliação da pergunta "${element.title}".`);
  }
  return value;
}

function normalizeGridAnswer(element: FormElement, value: FormAnswerValue, multiple: boolean): FormAnswerValue {
  if (!isRecord(value)) {
    return null;
  }

  const rowIds = new Set((element.settings?.grid?.rows ?? []).map((row) => row.id));
  const columnIds = new Set((element.settings?.grid?.columns ?? []).map((column) => column.id));
  if (multiple) {
    const answer: Record<string, string[]> = {};
    for (const [rowId, rawValue] of Object.entries(value)) {
      if (!rowIds.has(rowId)) {
        throw new BadRequestException(`Linha inválida para a pergunta "${element.title}".`);
      }
      if (Array.isArray(rawValue)) {
        const normalized = [...new Set(rawValue.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
        const invalid = normalized.find((item) => !columnIds.has(item));
        if (invalid) {
          throw new BadRequestException(`Coluna inválida para a pergunta "${element.title}".`);
        }
        if (normalized.length > 0) {
          answer[rowId] = normalized;
        }
      }
    }

    return Object.keys(answer).length > 0 ? answer : null;
  }

  const answer: Record<string, string> = {};
  for (const [rowId, rawValue] of Object.entries(value)) {
    if (!rowIds.has(rowId)) {
      throw new BadRequestException(`Linha inválida para a pergunta "${element.title}".`);
    }
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim();
      if (!columnIds.has(normalized)) {
        throw new BadRequestException(`Coluna inválida para a pergunta "${element.title}".`);
      }
      answer[rowId] = normalized;
    }
  }

  return Object.keys(answer).length > 0 ? answer : null;
}

function normalizeSchedulingAnswer(element: FormElement, value: FormAnswerValue): FormSchedulingAnswer | null {
  if (!isRecord(value) || typeof value['slotId'] !== 'string') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const slotId = value['slotId'].trim();
  if (!slotId) {
    return null;
  }
  if (!schedulingSlotIds(element).has(slotId)) {
    throw new BadRequestException(`Horário inválido para a pergunta "${element.title}".`);
  }
  const inviteesValue = record['invitees'];
  const invitees = Array.isArray(inviteesValue)
    ? inviteesValue
        .filter((invitee): invitee is Record<string, unknown> => isRecord(invitee))
        .map((invitee) => ({
          name: stringValue(invitee['name']),
          email: stringValue(invitee['email']) || undefined,
        }))
        .filter((invitee) => invitee.name)
    : [];
  const maxInvitees = element.settings?.scheduling?.maxInvitees ?? 0;
  if (invitees.length > maxInvitees) {
    throw new BadRequestException(`Número de convidados acima do limite da pergunta "${element.title}".`);
  }

  return {
    slotId,
    invitees,
  };
}

function isMissingRequiredAnswer(element: FormElement, value: FormAnswerValue): boolean {
  if (isEmptyAnswer(value)) {
    return true;
  }
  if (element.type === 'singleSelectionGrid' || element.type === 'multipleSelectionGrid') {
    if (!isRecord(value)) {
      return true;
    }
    const rows = element.settings?.grid?.rows ?? [];
    const answer = value as Record<string, FormAnswerValue>;
    return rows.length > 0 && rows.some((row) => isEmptyAnswer(answer[row.id] ?? null));
  }
  if (element.type === 'scheduling') {
    if (!isSchedulingAnswer(value)) {
      return true;
    }
    if (!value.slotId) {
      return true;
    }
    return element.settings?.scheduling?.inviteeMode === 'required' && value.invitees.length === 0;
  }
  return false;
}

function isSchedulingAnswer(value: FormAnswerValue): value is FormSchedulingAnswer {
  return isRecord(value) && typeof value['slotId'] === 'string' && Array.isArray(value['invitees']);
}

function optionIds(element: FormElement): Set<string> {
  return new Set(element.options.map((option) => option.id));
}

function schedulingSlotIds(element: FormElement): Set<string> {
  const settings = element.settings?.scheduling;
  if (!settings) {
    return new Set();
  }

  const slotIds = new Set<string>();
  const stepMinutes = Math.max(settings.slotIntervalMinutes, 1);
  const durationMinutes = Math.max(settings.durationMinutes, 1);
  for (const window of settings.availability) {
    const start = parseLocalTimeMinutes(window.startTime);
    const end = parseLocalTimeMinutes(window.endTime);
    if (start === null || end === null || end <= start) {
      continue;
    }
    for (let cursor = start; cursor + durationMinutes <= end; cursor += stepMinutes) {
      slotIds.add(
        `${window.id}:${formatLocalTimeMinutes(cursor)}-${formatLocalTimeMinutes(cursor + durationMinutes)}`,
      );
    }
  }
  return slotIds;
}

function parseLocalTimeMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatLocalTimeMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultTitle(type: string): string {
  switch (type) {
    case 'section':
      return 'Nova seção';
    case 'statement':
      return 'Texto informativo';
    default:
      return 'Pergunta sem título';
  }
}
