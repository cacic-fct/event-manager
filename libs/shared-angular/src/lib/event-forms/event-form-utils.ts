import {
  FORM_ELEMENT_TYPES,
  isFormAnswerElementType,
  type FormAnswerValue,
  type FormChoiceOption,
  type FormElement,
  type FormElementType,
  type FormResponseAnswer,
  type FormSchedulingAnswer,
  type FormSchedulingAvailabilityWindow,
  type FormSchedulingSettings,
} from '@cacic-fct/form-contracts';

export const EVENT_FORM_ELEMENT_LABELS: Record<FormElementType, string> = {
  section: 'Seção',
  statement: 'Texto',
  shortText: 'Resposta curta',
  longText: 'Resposta longa',
  singleChoice: 'Escolha única',
  multipleChoice: 'Múltipla escolha',
  singleSelectionGrid: 'Grade de escolha única',
  multipleSelectionGrid: 'Grade de múltipla escolha',
  selectionDropdown: 'Lista suspensa',
  linearScale: 'Escala linear',
  starRating: 'Avaliação por estrelas',
  date: 'Data',
  time: 'Hora',
  scheduling: 'Agendamento',
};

export const EVENT_FORM_ELEMENT_ICONS: Record<FormElementType, string> = {
  section: 'splitscreen',
  statement: 'notes',
  shortText: 'short_text',
  longText: 'subject',
  singleChoice: 'radio_button_checked',
  multipleChoice: 'check_box',
  singleSelectionGrid: 'table_rows',
  multipleSelectionGrid: 'checklist',
  selectionDropdown: 'arrow_drop_down_circle',
  linearScale: 'linear_scale',
  starRating: 'star',
  date: 'calendar_today',
  time: 'schedule',
  scheduling: 'event_available',
};

export const EVENT_FORM_ELEMENT_TYPES = FORM_ELEMENT_TYPES;

export type EventFormSchedulingSlot = {
  id: string;
  label: string;
};

export function createEventFormElement(type: FormElementType, index: number): FormElement {
  const base: FormElement = {
    id: crypto.randomUUID(),
    type,
    title: defaultTitle(type, index),
    required: isFormAnswerElementType(type),
    options: defaultOptions(type),
    settings: defaultSettings(type),
  };

  return base;
}

export function cloneFormElements(elements: readonly FormElement[]): FormElement[] {
  return JSON.parse(JSON.stringify(elements)) as FormElement[];
}

export function parseFormElementsJson(value: string | null | undefined): FormElement[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as FormElement[]) : [];
  } catch {
    return [];
  }
}

export function parseFormAnswersJson(value: string | null | undefined): FormResponseAnswer[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as FormResponseAnswer[]) : [];
  } catch {
    return [];
  }
}

export function serializeFormElements(elements: readonly FormElement[]): string {
  return JSON.stringify(elements);
}

export function serializeFormAnswers(answers: readonly FormResponseAnswer[]): string {
  return JSON.stringify(answers);
}

export function answerValue(answers: readonly FormResponseAnswer[], elementId: string): FormAnswerValue {
  return answers.find((answer) => answer.elementId === elementId)?.value ?? null;
}

export function isRequiredFormAnswerMissing(element: FormElement, value: FormAnswerValue): boolean {
  if (!element.required || !isFormAnswerElementType(element.type)) {
    return false;
  }

  if (isEmptyAnswerValue(value)) {
    return true;
  }

  if (element.type === 'singleSelectionGrid' || element.type === 'multipleSelectionGrid') {
    if (!isRecord(value)) {
      return true;
    }
    const rows = element.settings?.grid?.rows ?? [];
    const columns = element.settings?.grid?.columns ?? [];
    return rows.length === 0 || columns.length === 0 || rows.some((row) => isEmptyAnswerValue(value[row.id] ?? null));
  }

  if (element.type === 'scheduling') {
    if (!isSchedulingAnswer(value)) {
      return true;
    }
    if (!value.slotId) {
      return true;
    }
    return (
      element.settings?.scheduling?.inviteeMode === 'required' &&
      !value.invitees.some((invitee) => typeof invitee.name === 'string' && invitee.name.trim().length > 0)
    );
  }

  return false;
}

export function setAnswerValue(
  answers: readonly FormResponseAnswer[],
  elementId: string,
  value: FormAnswerValue,
): FormResponseAnswer[] {
  const next = answers.filter((answer) => answer.elementId !== elementId);
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return next;
  }
  return [...next, { elementId, value }];
}

export function createSchedulingSlots(settings: FormSchedulingSettings | undefined): EventFormSchedulingSlot[] {
  if (!settings) {
    return [];
  }

  return settings.availability.flatMap((window) => slotsForWindow(window, settings));
}

function slotsForWindow(
  window: FormSchedulingAvailabilityWindow,
  settings: FormSchedulingSettings,
): EventFormSchedulingSlot[] {
  const start = parseLocalTime(window.startTime);
  const end = parseLocalTime(window.endTime);
  if (start === null || end === null || end <= start) {
    return [];
  }

  const slots: EventFormSchedulingSlot[] = [];
  const stepMinutes = Math.max(settings.slotIntervalMinutes, 1);
  const durationMinutes = Math.max(settings.durationMinutes, 1);
  for (let cursor = start; cursor + durationMinutes <= end; cursor += stepMinutes) {
    const slotStart = toTime(cursor);
    const slotEnd = toTime(cursor + durationMinutes);
    const id = `${window.id}:${slotStart}-${slotEnd}`;
    slots.push({
      id,
      label: `${formatDate(window.date)} ${slotStart}-${slotEnd}`,
    });
  }
  return slots;
}

function parseLocalTime(time: string): number | null {
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

function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function isEmptyAnswerValue(value: FormAnswerValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, FormAnswerValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSchedulingAnswer(value: FormAnswerValue): value is FormSchedulingAnswer {
  return isRecord(value) && typeof value['slotId'] === 'string' && Array.isArray(value['invitees']);
}

function defaultTitle(type: FormElementType, index: number): string {
  if (type === 'section') {
    return `Seção ${index + 1}`;
  }

  if (type === 'statement') {
    return 'Texto informativo';
  }

  return `Pergunta ${index + 1}`;
}

function defaultOptions(type: FormElementType): FormChoiceOption[] {
  if (
    type === 'singleChoice' ||
    type === 'multipleChoice' ||
    type === 'selectionDropdown' ||
    type === 'singleSelectionGrid' ||
    type === 'multipleSelectionGrid'
  ) {
    return [
      { id: crypto.randomUUID(), label: 'Opção 1' },
      { id: crypto.randomUUID(), label: 'Opção 2' },
    ];
  }

  return [];
}

function defaultSettings(type: FormElementType): FormElement['settings'] | undefined {
  if (type === 'singleSelectionGrid' || type === 'multipleSelectionGrid') {
    return {
      grid: {
        rows: [
          { id: crypto.randomUUID(), label: 'Linha 1' },
          { id: crypto.randomUUID(), label: 'Linha 2' },
        ],
        columns: [
          { id: crypto.randomUUID(), label: 'Coluna 1' },
          { id: crypto.randomUUID(), label: 'Coluna 2' },
        ],
      },
    };
  }

  if (type === 'linearScale') {
    return {
      linearScale: {
        min: 1,
        max: 5,
        minLabel: 'Menor',
        maxLabel: 'Maior',
      },
    };
  }

  if (type === 'starRating') {
    return {
      starRating: {
        max: 5,
      },
    };
  }

  if (type === 'scheduling') {
    return {
      scheduling: {
        timezone: 'America/Sao_Paulo',
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inviteeMode: 'none',
        maxInvitees: 0,
        availability: [],
      },
    };
  }

  return undefined;
}
