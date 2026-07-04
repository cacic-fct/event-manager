import { BadRequestException } from '@nestjs/common';
import { FormElement } from '@cacic-fct/form-contracts';
import {
  assertStoredResponseHasCurrentRequiredAnswers,
  normalizeAnswers,
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
            type: 'singleChoice',
            required: true,
            options: [{ label: 'Primeira opcao' }, 'invalid option'],
          },
        ]),
      ),
    ).toMatchObject([
      {
        id: 'element-1',
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
});
