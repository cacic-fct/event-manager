import {
  answerValue,
  cloneFormElements,
  createEventFormElement,
  createSchedulingSlots,
  isRequiredFormAnswerMissing,
  parseFormAnswersJson,
  parseFormElementsJson,
  serializeFormAnswers,
  serializeFormElements,
  setAnswerValue,
} from './event-form-utils';

describe('event form utilities', () => {
  it('parses invalid form JSON as an empty element list', () => {
    expect(parseFormElementsJson('not-json')).toEqual([]);
    expect(parseFormElementsJson('{}')).toEqual([]);
  });

  it('creates default answer and non-answer elements with localized titles', () => {
    const shortText = createEventFormElement('shortText', 0);
    const statement = createEventFormElement('statement', 1);
    const singleChoice = createEventFormElement('singleChoice', 2);

    expect(shortText).toEqual(
      expect.objectContaining({
        type: 'shortText',
        title: 'Pergunta 1',
        required: true,
        options: [],
        settings: undefined,
      }),
    );
    expect(statement).toEqual(
      expect.objectContaining({
        type: 'statement',
        title: 'Texto informativo',
        required: false,
      }),
    );
    expect(singleChoice.options.map((option) => option.label)).toEqual(['Opção 1', 'Opção 2']);
  });

  it('clones and serializes form elements without preserving object references', () => {
    const elements = [createEventFormElement('longText', 0)];
    const cloned = cloneFormElements(elements);

    cloned[0].title = 'Titulo clonado';

    expect(elements[0].title).toBe('Pergunta 1');
    expect(parseFormElementsJson(serializeFormElements(cloned))).toEqual(cloned);
    expect(parseFormAnswersJson(serializeFormAnswers([{ elementId: 'answer-1', value: ['a', 'b'] }]))).toEqual([
      { elementId: 'answer-1', value: ['a', 'b'] },
    ]);
  });

  it('replaces answer values by element id', () => {
    const answers = setAnswerValue([{ elementId: 'shirt', value: 'm' }], 'shirt', 'g');

    expect(answerValue(answers, 'shirt')).toBe('g');
    expect(setAnswerValue(answers, 'shirt', '')).toEqual([]);
    expect(parseFormAnswersJson(JSON.stringify(answers))).toEqual(answers);
  });

  it('creates scheduling slots from availability windows', () => {
    const slots = createSchedulingSlots({
      timezone: 'America/Sao_Paulo',
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      inviteeMode: 'none',
      maxInvitees: 0,
      availability: [{ id: 'window-1', date: '2026-07-01', startTime: '09:00', endTime: '10:00' }],
    });

    expect(slots).toEqual([
      { id: 'window-1:09:00-09:30', label: '01/07/2026 09:00-09:30' },
      { id: 'window-1:09:30-10:00', label: '01/07/2026 09:30-10:00' },
    ]);
  });

  it('ignores invalid scheduling windows and clamps non-positive slot settings', () => {
    expect(createSchedulingSlots(undefined)).toEqual([]);
    expect(
      createSchedulingSlots({
        timezone: 'America/Sao_Paulo',
        durationMinutes: 0,
        slotIntervalMinutes: 0,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inviteeMode: 'none',
        maxInvitees: 0,
        availability: [
          { id: 'invalid-time', date: '2026-07-01', startTime: '25:00', endTime: '26:00' },
          { id: 'inverted', date: '2026-07-01', startTime: '10:00', endTime: '09:00' },
          { id: 'short', date: '2026-07-01', startTime: '09:00', endTime: '09:02' },
        ],
      }),
    ).toEqual([
      { id: 'short:09:00-09:01', label: '01/07/2026 09:00-09:01' },
      { id: 'short:09:01-09:02', label: '01/07/2026 09:01-09:02' },
    ]);
  });

  it('requires invitees when a required scheduling field asks for them', () => {
    const element = {
      id: 'meeting',
      type: 'scheduling',
      title: 'Reunião',
      required: true,
      options: [],
      settings: {
        scheduling: {
          timezone: 'America/Sao_Paulo',
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          inviteeMode: 'required',
          maxInvitees: 2,
          availability: [],
        },
      },
    } as const;

    expect(isRequiredFormAnswerMissing(element, { slotId: 'window-1:09:00-09:30', invitees: [] })).toBe(true);
    expect(
      isRequiredFormAnswerMissing(element, {
        slotId: 'window-1:09:00-09:30',
        invitees: [{} as never],
      }),
    ).toBe(true);
    expect(
      isRequiredFormAnswerMissing(element, {
        slotId: 'window-1:09:00-09:30',
        invitees: [{ name: 'Ada Lovelace' }],
      }),
    ).toBe(false);
  });

  it('treats malformed structured required answers as missing', () => {
    const schedulingElement = {
      id: 'meeting',
      type: 'scheduling',
      title: 'Reunião',
      required: true,
      options: [],
    } as const;
    const gridElement = {
      id: 'availability',
      type: 'singleSelectionGrid',
      title: 'Disponibilidade',
      required: true,
      options: [],
      settings: {
        grid: {
          rows: [{ id: 'mon', label: 'Segunda' }],
          columns: [{ id: 'yes', label: 'Sim' }],
        },
      },
    } as const;

    expect(isRequiredFormAnswerMissing(schedulingElement, { slotId: 'window-1:09:00-09:30' })).toBe(true);
    expect(isRequiredFormAnswerMissing(gridElement, 'yes')).toBe(true);
    expect(
      isRequiredFormAnswerMissing(
        {
          ...gridElement,
          settings: { grid: { rows: [], columns: [{ id: 'yes', label: 'Sim' }] } },
        },
        { mon: 'yes' },
      ),
    ).toBe(true);
    expect(
      isRequiredFormAnswerMissing(
        {
          ...gridElement,
          settings: { grid: { rows: [{ id: 'mon', label: 'Segunda' }], columns: [] } },
        },
        { mon: 'yes' },
      ),
    ).toBe(true);
    expect(isRequiredFormAnswerMissing(gridElement, { mon: 'yes' })).toBe(false);
  });
});
