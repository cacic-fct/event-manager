import {
  answerValue,
  createSchedulingSlots,
  isRequiredFormAnswerMissing,
  parseFormAnswersJson,
  parseFormElementsJson,
  setAnswerValue,
} from './event-form-utils';

describe('event form utilities', () => {
  it('parses invalid form JSON as an empty element list', () => {
    expect(parseFormElementsJson('not-json')).toEqual([]);
    expect(parseFormElementsJson('{}')).toEqual([]);
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
    expect(isRequiredFormAnswerMissing(gridElement, { mon: 'yes' })).toBe(false);
  });
});
