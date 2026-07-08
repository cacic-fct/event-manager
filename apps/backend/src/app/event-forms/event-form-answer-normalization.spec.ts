import { BadRequestException } from '@nestjs/common';
import { FormElement } from '@cacic-fct/form-contracts';
import {
  assertStoredResponseHasCurrentRequiredAnswers,
  isEmptyAnswer,
  normalizeAnswers,
  parseAnswersJson,
  parseElementsJson,
} from './event-form-answer-normalization';

describe('event form answer normalization', () => {
  it('normalizes submitted answer values and rejects unknown choices', () => {
    const elements: FormElement[] = [
      {
        id: 'name',
        type: 'shortText',
        title: 'Nome',
        required: true,
      } as FormElement,
      {
        id: 'tracks',
        type: 'multipleChoice',
        title: 'Trilhas',
        required: true,
        options: [
          { id: 'angular', label: 'Angular' },
          { id: 'nestjs', label: 'NestJS' },
        ],
      } as FormElement,
      {
        id: 'day',
        type: 'date',
        title: 'Dia',
        required: false,
      } as FormElement,
      {
        id: 'time',
        type: 'time',
        title: 'Horario',
        required: false,
      } as FormElement,
    ];

    expect(
      normalizeAnswers(
        JSON.stringify([
          { elementId: 'name', value: '  Ana  ' },
          { elementId: 'tracks', value: ['angular', 'angular', 'nestjs'] },
          { elementId: 'day', value: '2026-07-01' },
          { elementId: 'time', value: '09:30' },
        ]),
        elements,
        true,
      ),
    ).toEqual([
      { elementId: 'name', value: 'Ana' },
      { elementId: 'tracks', value: ['angular', 'nestjs'] },
      { elementId: 'day', value: '2026-07-01' },
      { elementId: 'time', value: '09:30' },
    ]);

    expect(() =>
      normalizeAnswers(
        JSON.stringify([{ elementId: 'tracks', value: ['vue'] }]),
        elements,
        false,
      ),
    ).toThrow(BadRequestException);
  });

  it('enforces required current questions for stored responses', () => {
    const form = {
      name: 'Pesquisa final',
      elements: [
        {
          id: 'feedback',
          type: 'longText',
          title: 'Feedback',
          required: true,
        },
      ],
    };

    expect(() => assertStoredResponseHasCurrentRequiredAnswers(form, [])).toThrow(BadRequestException);
    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(form, [{ elementId: 'feedback', value: 'Otimo evento' }]),
    ).not.toThrow();
  });

  it('parses legacy element JSON with safe defaults', () => {
    expect(
      parseElementsJson(
        JSON.stringify([
          {
            type: 'section',
          },
          {
            type: 'statement',
          },
          {
            type: 'singleChoice',
            required: true,
            options: [{ label: 'Primeira opcao' }, 'invalid option'],
          },
        ]),
      ),
    ).toMatchObject([
      {
        id: 'element-1',
        title: 'Nova seção',
        type: 'section',
      },
      {
        id: 'element-2',
        title: 'Texto informativo',
        type: 'statement',
      },
      {
        id: 'element-3',
        title: 'Pergunta sem título',
        type: 'singleChoice',
        required: true,
        options: [
          { id: 'option-1', label: 'Primeira opcao', description: undefined },
          { id: 'option-2', label: 'Opção 2' },
        ],
      },
    ]);
  });

  it('rejects malformed element JSON and invalid element entries', () => {
    expect(() => parseElementsJson('{')).toThrow('JSON dos itens do formulário inválido.');
    expect(() => parseElementsJson('{"type":"shortText"}')).toThrow('Itens do formulário devem ser uma lista.');
    expect(() => parseElementsJson(JSON.stringify([null]))).toThrow('Item 1 do formulário é inválido.');
    expect(() => parseElementsJson(JSON.stringify([{ type: 'unknown' }]))).toThrow(
      'Tipo do item 1 do formulário é inválido.',
    );
    expect(() => parseAnswersJson('{')).toThrow('JSON das respostas inválido.');
  });

  it('normalizes optional empty values to null without enforcing required answers', () => {
    const elements: FormElement[] = [
      textElement('name', 'shortText'),
      choiceElement('track', 'selectionDropdown'),
      baseElement('day', 'date'),
      baseElement('time', 'time'),
      scaleElement('score'),
      ratingElement('rating'),
      gridElement('single-grid', 'singleSelectionGrid'),
      gridElement('multiple-grid', 'multipleSelectionGrid'),
      schedulingElement('schedule', 'optional'),
    ];

    expect(
      normalizeAnswers(
        JSON.stringify([
          { elementId: 'name', value: '   ' },
          { elementId: 'track', value: '' },
          { elementId: 'track-value', value: 1 },
          { elementId: 'day', value: '' },
          { elementId: 'day-value', value: 1 },
          { elementId: 'time', value: 8 },
          { elementId: 'time-empty', value: '   ' },
          { elementId: 'tracks', value: 'angular' },
          { elementId: 'score', value: 2.5 },
          { elementId: 'rating', value: 'five' },
          { elementId: 'single-grid', value: null },
          { elementId: 'multiple-grid', value: { row1: [] } },
          { elementId: 'empty-schedule', value: {} },
          { elementId: 'schedule', value: { slotId: '   ' } },
        ]),
        [
          ...elements,
          choiceElement('track-value', 'selectionDropdown'),
          baseElement('day-value', 'date'),
          baseElement('time-empty', 'time'),
          {
            ...choiceElement('tracks', 'singleChoice'),
            type: 'multipleChoice',
          } as FormElement,
          schedulingElement('empty-schedule', 'optional'),
        ],
        false,
      ),
    ).toEqual([
      { elementId: 'name', value: null },
      { elementId: 'track', value: null },
      { elementId: 'track-value', value: null },
      { elementId: 'day', value: null },
      { elementId: 'day-value', value: null },
      { elementId: 'time', value: null },
      { elementId: 'time-empty', value: null },
      { elementId: 'tracks', value: null },
      { elementId: 'score', value: null },
      { elementId: 'rating', value: null },
      { elementId: 'single-grid', value: null },
      { elementId: 'multiple-grid', value: null },
      { elementId: 'empty-schedule', value: null },
      { elementId: 'schedule', value: null },
    ]);
  });

  it('normalizes choice, scale, rating, grid, and scheduling answers', () => {
    const elements: FormElement[] = [
      choiceElement('track', 'selectionDropdown'),
      scaleElement('score'),
      ratingElement('rating'),
      gridElement('single-grid', 'singleSelectionGrid'),
      gridElement('multiple-grid', 'multipleSelectionGrid'),
      schedulingElement('schedule', 'optional'),
    ];

    expect(
      normalizeAnswers(
        JSON.stringify([
          { elementId: 'track', value: ' angular ' },
          { elementId: 'score', value: 4 },
          { elementId: 'rating', value: 3 },
          { elementId: 'single-grid', value: { row1: ' yes ', row2: 2 } },
          { elementId: 'multiple-grid', value: { row1: [' yes ', 'yes', 'no', 3], row2: 'ignored' } },
          {
            elementId: 'schedule',
            value: {
              slotId: ' window-1:09:00-09:30 ',
              invitees: [
                { name: ' Ana ', email: ' ana@example.com ' },
                { name: '   ', email: 'ignored@example.com' },
                null,
              ],
            },
          },
        ]),
        elements,
        true,
      ),
    ).toEqual([
      { elementId: 'track', value: 'angular' },
      { elementId: 'score', value: 4 },
      { elementId: 'rating', value: 3 },
      { elementId: 'single-grid', value: { row1: 'yes' } },
      { elementId: 'multiple-grid', value: { row1: ['yes', 'no'] } },
      {
        elementId: 'schedule',
        value: {
          slotId: 'window-1:09:00-09:30',
          invitees: [{ name: 'Ana', email: 'ana@example.com' }],
        },
      },
    ]);
  });

  it('rejects invalid scalar, grid, and scheduling answers', () => {
    const cases: Array<{ element: FormElement; value: unknown; message: string }> = [
      { element: choiceElement('track', 'selectionDropdown'), value: 'vue', message: 'Opção inválida' },
      { element: baseElement('day', 'date'), value: '2026-02-30', message: 'Data inválida' },
      { element: baseElement('day', 'date'), value: '20260701', message: 'Data inválida' },
      { element: baseElement('time', 'time'), value: '24:00', message: 'Hora inválida' },
      { element: baseElement('time', 'time'), value: '09:70', message: 'Hora inválida' },
      { element: scaleElement('score'), value: 6, message: 'Valor fora da escala' },
      { element: ratingElement('rating'), value: 0, message: 'Valor fora da avaliação' },
      { element: gridElement('single-grid', 'singleSelectionGrid'), value: { missing: 'yes' }, message: 'Linha inválida' },
      { element: gridElement('single-grid', 'singleSelectionGrid'), value: { row1: 'maybe' }, message: 'Coluna inválida' },
      { element: gridElement('multiple-grid', 'multipleSelectionGrid'), value: { missing: ['yes'] }, message: 'Linha inválida' },
      {
        element: gridElement('multiple-grid', 'multipleSelectionGrid'),
        value: { row1: ['maybe'] },
        message: 'Coluna inválida',
      },
      {
        element: schedulingElement('schedule', 'optional'),
        value: { slotId: 'window-1:09:30-10:00', invitees: [] },
        message: 'Horário inválido',
      },
      {
        element: schedulingElement('schedule', 'optional'),
        value: { slotId: 'window-1:09:00-09:30', invitees: [{ name: 'Ana' }, { name: 'Bia' }] },
        message: 'Número de convidados acima do limite',
      },
      {
        element: baseElement('schedule-without-settings', 'scheduling'),
        value: { slotId: 'window-1:09:00-09:30', invitees: [] },
        message: 'Horário inválido',
      },
    ];

    for (const item of cases) {
      expect(() =>
        normalizeAnswers(JSON.stringify([{ elementId: item.element.id, value: item.value }]), [item.element], false),
      ).toThrow(item.message);
    }
  });

  it('enforces required grid rows and scheduling invitees', () => {
    expect(() =>
      normalizeAnswers(
        JSON.stringify([{ elementId: 'single-grid', value: 'yes' }]),
        [gridElement('single-grid', 'singleSelectionGrid', true)],
        true,
      ),
    ).toThrow('A pergunta "single-grid" é obrigatória.');

    expect(() =>
      normalizeAnswers(
        JSON.stringify([{ elementId: 'single-grid', value: { row1: 'yes' } }]),
        [gridElement('single-grid', 'singleSelectionGrid', true)],
        true,
      ),
    ).toThrow('A pergunta "single-grid" é obrigatória.');

    expect(() =>
      normalizeAnswers(
        JSON.stringify([{ elementId: 'schedule', value: { slotId: 'window-1:09:00-09:30', invitees: [] } }]),
        [schedulingElement('schedule', 'required', true)],
        true,
      ),
    ).toThrow('A pergunta "schedule" é obrigatória.');
  });

  it('ignores non-list stored answers and validates current stored required answers', () => {
    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(
        { name: 'Entrevista', elements: [gridElement('single-grid', 'singleSelectionGrid', true)] },
        [{ elementId: 'single-grid', value: 'yes' }],
      ),
    ).toThrow('Responda o formulário obrigatório "Entrevista" para concluir a inscrição.');

    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(
        { name: 'Entrevista', elements: [schedulingElement('schedule', 'required', true)] },
        [{ elementId: 'schedule', value: { slotId: 'window-1:09:00-09:30', invitees: 'invalid' } }],
      ),
    ).toThrow('Responda o formulário obrigatório "Entrevista" para concluir a inscrição.');

    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(
        { name: 'Entrevista', elements: [schedulingElement('schedule', 'required', true)] },
        [{ elementId: 'schedule', value: { slotId: '', invitees: [] } }],
      ),
    ).toThrow('Responda o formulário obrigatório "Entrevista" para concluir a inscrição.');

    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(
        { name: 'Entrevista', elements: [schedulingElement('schedule', 'required', true)] },
        { elementId: 'schedule', value: null },
      ),
    ).toThrow('Responda o formulário obrigatório "Entrevista" para concluir a inscrição.');

    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers(
        { name: 'Entrevista', elements: [schedulingElement('schedule', 'required', true)] },
        [{ elementId: 'schedule', value: { slotId: 'window-1:09:00-09:30', invitees: [{ name: 'Ana' }] } }],
      ),
    ).not.toThrow();

    expect(() =>
      assertStoredResponseHasCurrentRequiredAnswers({ name: 'Entrevista', elements: null }, null),
    ).not.toThrow();
  });

  it('identifies empty answer values', () => {
    expect(isEmptyAnswer(null)).toBe(true);
    expect(isEmptyAnswer(undefined as never)).toBe(true);
    expect(isEmptyAnswer('   ')).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer({})).toBe(true);
    expect(isEmptyAnswer(0)).toBe(false);
    expect(isEmptyAnswer(['answer'])).toBe(false);
    expect(isEmptyAnswer({ row1: 'yes' })).toBe(false);
  });
});

function baseElement(id: string, type: FormElement['type'], required = false): FormElement {
  return {
    id,
    type,
    title: id,
    required,
    options: [],
  } as FormElement;
}

function textElement(id: string, type: 'shortText' | 'longText', required = false): FormElement {
  return baseElement(id, type, required);
}

function choiceElement(id: string, type: 'singleChoice' | 'selectionDropdown', required = false): FormElement {
  return {
    ...baseElement(id, type, required),
    options: [
      { id: 'angular', label: 'Angular' },
      { id: 'nestjs', label: 'NestJS' },
    ],
  };
}

function scaleElement(id: string, required = false): FormElement {
  return {
    ...baseElement(id, 'linearScale', required),
    settings: {
      linearScale: { min: 1, max: 5 },
    },
  };
}

function ratingElement(id: string, required = false): FormElement {
  return {
    ...baseElement(id, 'starRating', required),
    settings: {
      starRating: { max: 5 },
    },
  };
}

function gridElement(
  id: string,
  type: 'singleSelectionGrid' | 'multipleSelectionGrid',
  required = false,
): FormElement {
  return {
    ...baseElement(id, type, required),
    settings: {
      grid: {
        rows: [
          { id: 'row1', label: 'Linha 1' },
          { id: 'row2', label: 'Linha 2' },
        ],
        columns: [
          { id: 'yes', label: 'Sim' },
          { id: 'no', label: 'Não' },
        ],
      },
    },
  };
}

function schedulingElement(
  id: string,
  inviteeMode: 'none' | 'optional' | 'required',
  required = false,
): FormElement {
  return {
    ...baseElement(id, 'scheduling', required),
    settings: {
      scheduling: {
        timezone: 'America/Sao_Paulo',
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inviteeMode,
        maxInvitees: 1,
        availability: [
          { id: 'invalid-start', date: '2026-07-01', startTime: 'bad', endTime: '10:00' },
          { id: 'invalid-end', date: '2026-07-01', startTime: '09:00', endTime: '25:00' },
          { id: 'reversed', date: '2026-07-01', startTime: '10:00', endTime: '09:00' },
          { id: 'window-1', date: '2026-07-01', startTime: '09:00', endTime: '09:30' },
        ],
      },
    },
  };
}
