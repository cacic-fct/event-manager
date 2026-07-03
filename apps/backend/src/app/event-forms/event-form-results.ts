import { EventFormResults } from '@cacic-fct/shared-data-types';
import {
  isFormAnswerElementType,
  type FormAnswerValue,
  type FormElement,
  type FormResponseAnswer,
} from '@cacic-fct/form-contracts';
import { EventFormResponseRecord } from './event-form-records';
import { isEmptyAnswer, isRecord, parseAnswersJson, parseAnswersValue, parseElementsJson } from './event-form-answer-normalization';

type FormResultSummary = {
  questions: Array<{
    elementId: string;
    title: string;
    type: string;
    answeredCount: number;
    buckets: Array<{ label: string; value: number }>;
    textAnswers: string[];
  }>;
};

export function buildFormResultSummary(
  elements: readonly FormElement[],
  responses: readonly EventFormResponseRecord[],
  includeTextAnswers: boolean,
): FormResultSummary {
  const answerElements = elements.filter((element) => isFormAnswerElementType(element.type));
  const responseAnswers = responses.map((response) => {
    try {
      return parseAnswersValue(response.answers);
    } catch {
      return [];
    }
  });

  return {
    questions: answerElements.map((element) => {
      const values = responses
        .map((_, index) => valueForElement(responseAnswers[index] ?? [], element.id))
        .filter((value) => !isEmptyAnswer(value));

      return {
        elementId: element.id,
        title: element.title,
        type: element.type,
        answeredCount: values.length,
        buckets: buildBuckets(element, values),
        textAnswers: includeTextAnswers ? buildTextAnswers(element, values) : [],
      };
    }),
  };
}

export function eventFormResultsToCsv(results: EventFormResults): string {
  const elements = parseElementsJson(results.form.elementsJson).filter((element) => isFormAnswerElementType(element.type));
  const rows = [
    [
      'Resposta',
      'Pessoa',
      'E-mail',
      'Enviado em',
      ...elements.map((element) => element.title),
    ],
  ];

  for (const response of results.responses) {
    const answers = parseAnswersJson(response.answersJson);
    const answersByElementId = new Map(answers.map((answer) => [answer.elementId, answer.value]));
    rows.push([
      response.id,
      response.respondentName ?? '',
      response.respondentEmail ?? '',
      response.submittedAt ? response.submittedAt.toISOString() : '',
      ...elements.map((element) => answerToCsvCell(element, answersByElementId.get(element.id) ?? null)),
    ]);
  }

  return rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n');
}

function buildBuckets(element: FormElement, values: readonly FormAnswerValue[]): Array<{ label: string; value: number }> {
  if (['shortText', 'longText', 'date', 'time', 'scheduling'].includes(element.type)) {
    return [];
  }

  const buckets = new Map<string, number>();
  const optionLabels = new Map(element.options.map((option) => [option.id, option.label]));
  const add = (key: string | number) => {
    const label = optionLabels.get(String(key)) ?? String(key);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  };

  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      add(value);
    } else if (Array.isArray(value)) {
      value.forEach(add);
    } else if (isRecord(value)) {
      for (const entry of Object.values(value)) {
        if (typeof entry === 'string' || typeof entry === 'number') {
          add(entry);
        } else if (Array.isArray(entry)) {
          entry.forEach((item) => add(String(item)));
        }
      }
    }
  }

  return [...buckets.entries()].map(([label, value]) => ({ label, value }));
}

function buildTextAnswers(element: FormElement, values: readonly FormAnswerValue[]): string[] {
  if (element.type !== 'shortText' && element.type !== 'longText') {
    return [];
  }

  return values.filter((value): value is string => typeof value === 'string');
}

function valueForElement(answers: readonly FormResponseAnswer[], elementId: string): FormAnswerValue {
  return answers.find((answer) => answer.elementId === elementId)?.value ?? null;
}

function answerToCsvCell(element: FormElement, value: FormAnswerValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    if (element.options.length > 0) {
      return element.options.find((option) => option.id === String(value))?.label ?? String(value);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => element.options.find((option) => option.id === item)?.label ?? item)
      .join('; ');
  }
  return JSON.stringify(value);
}

export function csvCell(value: string): string {
  const neutralizedValue = startsWithCsvFormula(value) ? `'${value}` : value;
  return `"${neutralizedValue.replace(/"/g, '""')}"`;
}

function startsWithCsvFormula(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character.trim() === '' || code <= 0x1f || code === 0x7f) {
      continue;
    }

    return character === '=' || character === '+' || character === '-' || character === '@';
  }

  return false;
}
