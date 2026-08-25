import '@angular/compiler';
import { computed, signal } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type {
  FormElement,
  FormElementType,
  FormResponseAnswer,
} from '@cacic-fct/form-contracts';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { EVENT_FORM_ELEMENT_LABELS } from '@cacic-fct/shared-angular/event-forms';
import { EventFormBuilderComponent } from '@cacic-fct/shared-angular/event-forms';
import { EventFormRendererComponent } from '@cacic-fct/shared-angular/event-forms';

describe('shared event form builder operations', () => {
  it('adds, moves, drops, duplicates, and removes elements without mutating inputs', () => {
    const original = [element('first', 'shortText', 'Primeira'), element('second', 'statement', 'Segundo')];
    const { component, changes } = builderHarness(original);

    component.addType.set('longText');
    component.addElement();
    expect(changes).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'longText', title: '' })]),
    );
    expect(original).toEqual([element('first', 'shortText', 'Primeira'), element('second', 'statement', 'Segundo')]);

    component.move(1, -1);
    expect(changes).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'second' }),
      expect.objectContaining({ id: 'first' }),
      expect.objectContaining({ type: 'longText' }),
    ]);
    component.move(0, -1);
    expect(changes).toHaveBeenCalledTimes(2);

    component.drop({ previousIndex: 1, currentIndex: 0 } as CdkDragDrop<readonly FormElement[]>);
    expect(changes).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'first' }),
      expect.objectContaining({ id: 'second' }),
      expect.objectContaining({ type: 'longText' }),
    ]);
    component.drop({ previousIndex: 0, currentIndex: 0 } as CdkDragDrop<readonly FormElement[]>);
    expect(changes).toHaveBeenCalledTimes(3);

    component.duplicate(0);
    const duplicate = changes.mock.lastCall?.[0][1];
    expect(duplicate).toEqual(expect.objectContaining({ title: 'Primeira (cópia)' }));
    expect(duplicate?.id).not.toBe('first');
    expect(duplicate).not.toBe(original[0]);
    expect(changes.mock.lastCall?.[0]).toHaveLength(4);

    component.remove('second');
    expect(changes.mock.lastCall?.[0]).toHaveLength(3);
    expect(changes.mock.lastCall?.[0]).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'second' })]));
    component.remove('unknown');
    expect(changes.mock.lastCall?.[0]).toHaveLength(3);
  });

  it('updates text, required state, and ordinary choice options immutably', () => {
    const original = [
      element('choice', 'singleChoice', 'Escolha', {
        options: [option('a', 'A'), option('b', 'B')],
      }),
    ];
    const { component, changes } = builderHarness(original);

    component.updateText('choice', 'title', textEvent('Novo título'));
    expect(changes).toHaveBeenLastCalledWith([expect.objectContaining({ title: 'Novo título' })]);
    component.updateText('choice', 'description', textEvent('Descrição'));
    expect(changes).toHaveBeenLastCalledWith([expect.objectContaining({ description: 'Descrição' })]);
    component.updateText('choice', 'description', textEvent(''));
    expect(changes).toHaveBeenLastCalledWith([expect.objectContaining({ description: undefined })]);

    component.updateRequired('choice', false);
    expect(changes).toHaveBeenLastCalledWith([expect.objectContaining({ required: false })]);

    component.addOption('choice', 'options');
    const withOption = changes.mock.lastCall?.[0][0];
    if (!withOption) {
      throw new Error('The builder must emit the updated element.');
    }
    expect(withOption.options).toHaveLength(3);
    component.updateOption('choice', 'options', 'a', textEvent('Atualizada'));
    expect(changes).toHaveBeenLastCalledWith([
      expect.objectContaining({
        options: expect.arrayContaining([option('a', 'Atualizada'), option('b', 'B')]),
      }),
    ]);
    component.removeOption('choice', 'options', 'b');
    expect(changes).toHaveBeenLastCalledWith([
      expect.objectContaining({
        options: expect.arrayContaining([option('a', 'Atualizada')]),
      }),
    ]);
    expect(original[0].options).toEqual([option('a', 'A'), option('b', 'B')]);
  });

  it('updates grid rows and columns through the same immutable collection operations', () => {
    const original = [
      element('grid', 'singleSelectionGrid', 'Grade', {
        settings: {
          grid: {
            rows: [option('row-a', 'Linha A')],
            columns: [option('column-a', 'Coluna A')],
          },
        },
      }),
    ];
    const { component, changes } = builderHarness(original);

    component.addOption('grid', 'gridRows');
    component.updateOption('grid', 'gridRows', 'row-a', textEvent('Linha atualizada'));
    component.addOption('grid', 'gridColumns');
    component.updateOption('grid', 'gridColumns', 'column-a', textEvent('Coluna atualizada'));

    const changed = changes.mock.lastCall?.[0][0] as FormElement;
    expect(changed.settings?.grid?.rows).toEqual([
      option('row-a', 'Linha atualizada'),
      expect.objectContaining({ label: '' }),
    ]);
    expect(changed.settings?.grid?.columns).toEqual([
      option('column-a', 'Coluna atualizada'),
      expect.objectContaining({ label: '' }),
    ]);

    component.removeOption('grid', 'gridRows', 'row-a');
    component.removeOption('grid', 'gridColumns', 'column-a');
    const removed = changes.mock.lastCall?.[0][0] as FormElement;
    expect(removed.settings?.grid?.rows).toHaveLength(1);
    expect(removed.settings?.grid?.columns).toHaveLength(1);
    expect(original[0].settings?.grid?.rows).toEqual([option('row-a', 'Linha A')]);
  });

  it('clamps linear and star settings and preserves their independent labels', () => {
    const original = [
      element('scale', 'linearScale', 'Escala', {
        settings: { linearScale: { min: 1, max: 5, minLabel: 'Baixo', maxLabel: 'Alto' } },
      }),
      element('stars', 'starRating', 'Estrelas', { settings: { starRating: { max: 5 } } }),
    ];
    const { component, changes } = builderHarness(original);

    component.updateLinearMin('scale', 0);
    expect(changes).toHaveBeenLastCalledWith([
      expect.objectContaining({ settings: { linearScale: { min: 0, max: 5, minLabel: 'Baixo', maxLabel: 'Alto' } } }),
      original[1],
    ]);
    component.updateLinearNumber('scale', textEvent('1'));
    expect((changes.mock.lastCall?.[0][0] as FormElement).settings?.linearScale?.max).toBe(2);
    component.updateLinearNumber('scale', textEvent('9'));
    expect((changes.mock.lastCall?.[0][0] as FormElement).settings?.linearScale?.max).toBe(9);
    component.updateLinearText('scale', 'minLabel', textEvent(''));
    component.updateLinearText('scale', 'maxLabel', textEvent('Muito alto'));
    expect((changes.mock.lastCall?.[0][0] as FormElement).settings?.linearScale).toEqual(
      expect.objectContaining({ minLabel: undefined, maxLabel: 'Muito alto' }),
    );

    component.updateStarMax('stars', textEvent('-2'));
    expect((changes.mock.lastCall?.[0][1] as FormElement).settings?.starRating?.max).toBe(1);
    component.updateStarMax('stars', textEvent('99'));
    expect((changes.mock.lastCall?.[0][1] as FormElement).settings?.starRating?.max).toBe(10);
    expect(original[0].settings?.linearScale?.max).toBe(5);
  });

  it('supports scheduling text, numeric limits, invitee modes, and availability windows', () => {
    const today = publicFixtureDateFromNow().slice(0, 10);
    const original = [
      element('schedule', 'scheduling', 'Agendamento', {
        settings: {
          scheduling: {
            timezone: 'America/Sao_Paulo',
            durationMinutes: 30,
            slotIntervalMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            inviteeMode: 'none',
            maxInvitees: 0,
            availability: [{ id: 'window-1', date: today, startTime: '09:00', endTime: '10:00' }],
          },
        },
      }),
    ];
    const { component, changes } = builderHarness(original);

    component.updateSchedulingText('schedule', 'hostName', textEvent('Responsável'));
    component.updateSchedulingText('schedule', 'location', textEvent('Sala 1'));
    component.updateSchedulingText('schedule', 'timezone', textEvent(''));
    component.updateSchedulingNumber('schedule', 'durationMinutes', textEvent('0'));
    component.updateSchedulingNumber('schedule', 'slotIntervalMinutes', textEvent('0'));
    component.updateSchedulingNumber('schedule', 'maxInvitees', textEvent('-1'));
    component.updateSchedulingInviteeMode('schedule', 'required');

    let scheduling = (changes.mock.lastCall?.[0][0] as FormElement).settings?.scheduling;
    expect(scheduling).toEqual(
      expect.objectContaining({
        hostName: 'Responsável',
        location: 'Sala 1',
        timezone: 'America/Sao_Paulo',
        durationMinutes: 1,
        slotIntervalMinutes: 1,
        maxInvitees: 1,
        inviteeMode: 'required',
      }),
    );

    component.addOption('schedule', 'availability');
    scheduling = (changes.mock.lastCall?.[0][0] as FormElement).settings?.scheduling;
    expect(scheduling?.availability).toHaveLength(2);
    const replacementDate = publicFixtureDateFromNow(1).slice(0, 10);
    component.updateAvailability('schedule', 'window-1', 'date', textEvent(replacementDate));
    component.updateAvailability('schedule', 'window-1', 'startTime', textEvent('10:00'));
    component.updateAvailability('schedule', 'window-1', 'endTime', textEvent('11:00'));
    scheduling = (changes.mock.lastCall?.[0][0] as FormElement).settings?.scheduling;
    expect(scheduling?.availability[0]).toEqual({
      id: 'window-1',
      date: replacementDate,
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(original[0].settings?.scheduling?.availability[0]?.startTime).toBe('09:00');
  });

  it('identifies option, grid, and answer element types', () => {
    const { component } = builderHarness([]);

    expect(component.usesOptions('singleChoice')).toBe(true);
    expect(component.usesOptions('multipleChoice')).toBe(true);
    expect(component.usesOptions('selectionDropdown')).toBe(true);
    expect(component.usesOptions('shortText')).toBe(false);
    expect(component.isGrid('singleSelectionGrid')).toBe(true);
    expect(component.isGrid('multipleSelectionGrid')).toBe(true);
    expect(component.isGrid('singleChoice')).toBe(false);
    expect(component.isAnswerElement('shortText')).toBe(true);
    expect(component.isAnswerElement('section')).toBe(false);
  });
});

describe('shared event form renderer operations', () => {
  it('supports string, number, option, array, and grid answers with output emissions', () => {
    const elements = rendererElements();
    const { component, changes } = rendererHarness(elements);
    const answerDate = publicFixtureDateFromNow().slice(0, 10);

    component.setStringAnswer('short', textEvent('short answer'));
    component.setStringAnswer('long', textEvent('long answer', 'textarea'));
    component.setAnswer('single', 'b');
    component.setAnswer('dropdown', 'option-1');
    component.setAnswer('scale', 4);
    component.setAnswer('stars', 5);
    component.setStringAnswer('date', textEvent(answerDate));
    component.setStringAnswer('time', textEvent('14:30'));
    component.setGridStringAnswer('single-grid', 'row-1', 'column-2');
    component.toggleGridMultipleAnswer('multiple-grid', 'row-1', 'column-1', true);
    component.toggleGridMultipleAnswer('multiple-grid', 'row-1', 'column-2', true);
    component.toggleGridMultipleAnswer('multiple-grid', 'row-1', 'column-1', false);
    component.toggleMultipleAnswer('multiple', 'option-1', true);
    component.toggleMultipleAnswer('multiple', 'option-2', true);
    component.toggleMultipleAnswer('multiple', 'option-1', false);

    expect(component.stringAnswer('short')).toBe('short answer');
    expect(component.stringAnswer('long')).toBe('long answer');
    expect(component.stringAnswer('single')).toBe('b');
    expect(component.numberAnswer('scale')).toBe(4);
    expect(component.numberAnswer('missing')).toBe(0);
    expect(component.gridStringAnswer('single-grid', 'row-1')).toBe('column-2');
    expect(component.isGridOptionChecked('multiple-grid', 'row-1', 'column-1')).toBe(false);
    expect(component.isGridOptionChecked('multiple-grid', 'row-1', 'column-2')).toBe(true);
    expect(component.isOptionChecked('multiple', 'option-1')).toBe(false);
    expect(component.isOptionChecked('multiple', 'option-2')).toBe(true);
    expect(changes).toHaveBeenCalled();
    expect(changes.mock.lastCall?.[0]).toEqual([
      { elementId: 'short', value: 'short answer' },
      { elementId: 'long', value: 'long answer' },
      { elementId: 'single', value: 'b' },
      { elementId: 'dropdown', value: 'option-1' },
      { elementId: 'scale', value: 4 },
      { elementId: 'stars', value: 5 },
      { elementId: 'date', value: answerDate },
      { elementId: 'time', value: '14:30' },
      { elementId: 'single-grid', value: { 'row-1': 'column-2' } },
      { elementId: 'multiple-grid', value: { 'row-1': ['column-2'] } },
      { elementId: 'multiple', value: ['option-2'] },
    ]);
  });

  it('removes empty answers and reads initial answers without mutating them', () => {
    const initialAnswers: FormResponseAnswer[] = [
      { elementId: 'short', value: 'existing' },
      { elementId: 'multiple', value: ['option-1'] },
    ];
    const { component, changes } = rendererHarness(rendererElements(), initialAnswers);

    component.setAnswer('short', '');
    component.setAnswer('multiple', []);
    component.setAnswer('missing', null);

    expect(component.stringAnswer('short')).toBe('');
    expect(component.isOptionChecked('multiple', 'option-1')).toBe(false);
    expect(initialAnswers).toEqual([
      { elementId: 'short', value: 'existing' },
      { elementId: 'multiple', value: ['option-1'] },
    ]);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('supports scheduling slots, invitees, limits, and invitee field updates', () => {
    const { component } = rendererHarness(rendererElements());
    const schedule = rendererElements().find((element) => element.id === 'schedule');
    if (!schedule) {
      throw new Error('The renderer fixture must include scheduling.');
    }

    expect(component.schedulingSlots(schedule)).toEqual([
      { id: 'window-1:09:00-09:30', label: expect.stringContaining('09:00-09:30') },
      { id: 'window-1:09:30-10:00', label: expect.stringContaining('09:30-10:00') },
    ]);
    expect(component.schedulingAnswer('schedule')).toBeNull();
    component.setSchedulingSlot('schedule', 'window-1:09:00-09:30');
    expect(component.schedulingAnswer('schedule')).toEqual({ slotId: 'window-1:09:00-09:30', invitees: [] });
    expect(component.schedulingInvitees('schedule')).toEqual([]);
    expect(component.isSchedulingInviteeLimitReached(schedule)).toBe(false);

    component.addSchedulingInvitee(schedule);
    expect(component.schedulingInvitees('schedule')).toEqual([{ name: '' }]);
    expect(component.isSchedulingInviteeLimitReached(schedule)).toBe(true);
    component.addSchedulingInvitee(schedule);
    expect(component.schedulingInvitees('schedule')).toHaveLength(1);
    component.setSchedulingInviteeName('schedule', 0, textEvent('Ada'));
    component.setSchedulingInviteeEmail('schedule', 0, textEvent('ada@example.com'));
    expect(component.schedulingInvitees('schedule')).toEqual([{ name: 'Ada', email: 'ada@example.com' }]);
    component.setSchedulingSlot('schedule', 'window-1:09:30-10:00');
    expect(component.schedulingAnswer('schedule')).toEqual({
      slotId: 'window-1:09:30-10:00',
      invitees: [{ name: 'Ada', email: 'ada@example.com' }],
    });
  });

  it('formats every answer type for read-only display and exposes scale ranges', () => {
    const elements = rendererElements();
    const initialAnswers: FormResponseAnswer[] = [
      { elementId: 'short', value: 'Texto' },
      { elementId: 'single', value: 'option-2' },
      { elementId: 'multiple', value: ['option-1', 'option-2'] },
      { elementId: 'scale', value: 3 },
      { elementId: 'stars', value: 4 },
      { elementId: 'single-grid', value: { 'row-1': 'column-1' } },
      { elementId: 'multiple-grid', value: { 'row-1': ['column-1', 'column-2'] } },
      { elementId: 'date', value: '2026-05-20' },
      { elementId: 'schedule', value: { slotId: 'window-1:09:00-09:30', invitees: [] } },
    ];
    const { component } = rendererHarness(elements, initialAnswers);

    expect(component.answerDisplay(elements[0])).toBe('Texto');
    expect(component.answerDisplay(elements[2])).toBe('Opção 2');
    expect(component.answerDisplay(elements[3])).toBe('Opção 1, Opção 2');
    expect(component.answerDisplay(elements[7])).toBe('3');
    expect(component.answerDisplay(elements[8])).toBe('4');
    expect(component.answerDisplay(elements[4])).toBe('Linha 1: Coluna 1');
    expect(component.answerDisplay(elements[5])).toBe('Linha 1: Coluna 1, Coluna 2');
    expect(component.answerDisplay(elements[9])).toBe('20/05/2026');
    expect(component.answerDisplay(elements[11])).toContain('09:00-09:30');
    expect(component.answerDisplay(element('empty', 'shortText', 'Vazia'))).toBe('Sem resposta');
    expect(component.linearScaleValues(elements[7])).toEqual([1, 2, 3, 4, 5]);
    expect(component.starValues(elements[8])).toEqual([1, 2, 3, 4, 5]);
  });

  it('blocks invalid submissions, emits valid submissions, and marks missing required answers', () => {
    const elements = [
      element('required-text', 'shortText', 'Nome', { required: true }),
      element('required-grid', 'singleSelectionGrid', 'Disponibilidade', {
        required: true,
        settings: { grid: { rows: [option('row-1', 'Linha')], columns: [option('column-1', 'Coluna')] } },
      }),
      element('required-schedule', 'scheduling', 'Horário', {
        required: true,
        settings: {
          scheduling: {
            timezone: 'America/Sao_Paulo',
            durationMinutes: 30,
            slotIntervalMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            inviteeMode: 'required',
            maxInvitees: 1,
            availability: [],
          },
        },
      }),
    ];
    const { component, submitted } = rendererHarness(elements);
    const preventDefault = vi.fn();

    component.submit({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(component.showMissingRequired()).toBe(true);
    expect(component.valid()).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
    expect(component.isMissingRequired(elements[0])).toBe(true);
    expect(component.isMissingRequired(elements[1])).toBe(true);
    expect(component.isMissingRequired(elements[2])).toBe(true);

    component.setAnswer('required-text', 'Ada');
    component.setAnswer('required-grid', { 'row-1': 'column-1' });
    component.setAnswer('required-schedule', { slotId: 'slot-1', invitees: [{ name: 'Grace' }] });
    component.submit({ preventDefault } as unknown as Event);

    expect(component.valid()).toBe(true);
    expect(submitted).toHaveBeenCalledWith([
      { elementId: 'required-text', value: 'Ada' },
      { elementId: 'required-grid', value: { 'row-1': 'column-1' } },
      { elementId: 'required-schedule', value: { slotId: 'slot-1', invitees: [{ name: 'Grace' }] } },
    ]);
  });
});

function builderHarness(elements: readonly FormElement[]) {
  const component = Object.create(EventFormBuilderComponent.prototype) as EventFormBuilderComponent;
  const elementsSignal = signal(elements);
  const changes = vi.fn<(elements: FormElement[]) => void>((next) => elementsSignal.set(next));
  Object.assign(component, {
    elements: elementsSignal,
    elementsChange: { emit: changes },
    addType: signal<FormElementType>('shortText'),
  });
  return { component, changes };
}

function rendererHarness(elements: readonly FormElement[], initialAnswers: readonly FormResponseAnswer[] = []) {
  const component = Object.create(EventFormRendererComponent.prototype) as EventFormRendererComponent;
  const elementsSignal = signal(elements);
  const initialAnswersSignal = signal(initialAnswers);
  const answers = signal([...initialAnswers]);
  const submitted = vi.fn<(answers: FormResponseAnswer[]) => void>();
  const changes = vi.fn<(answers: FormResponseAnswer[]) => void>();
  Object.assign(component, {
    elements: elementsSignal,
    initialAnswers: initialAnswersSignal,
    readOnly: signal(false),
    showSubmit: signal(true),
    submitLabel: signal('Enviar respostas'),
    formSubmitted: { emit: submitted },
    answersChange: { emit: changes },
    answers,
    showMissingRequired: signal(false),
    valid: computed(() => elementsSignal().every((element) => !component.isMissingRequired(element))),
    labels: EVENT_FORM_ELEMENT_LABELS,
  });
  return { component, submitted, changes };
}

function rendererElements(): FormElement[] {
  const today = publicFixtureDateFromNow().slice(0, 10);
  return [
    element('short', 'shortText', 'Texto'),
    element('long', 'longText', 'Texto longo'),
    element('single', 'singleChoice', 'Escolha', { options: [option('option-1', 'Opção 1'), option('option-2', 'Opção 2')] }),
    element('multiple', 'multipleChoice', 'Múltipla', {
      options: [option('option-1', 'Opção 1'), option('option-2', 'Opção 2')],
    }),
    element('single-grid', 'singleSelectionGrid', 'Grade única', {
      settings: { grid: { rows: [option('row-1', 'Linha 1')], columns: [option('column-1', 'Coluna 1'), option('column-2', 'Coluna 2')] } },
    }),
    element('multiple-grid', 'multipleSelectionGrid', 'Grade múltipla', {
      settings: { grid: { rows: [option('row-1', 'Linha 1')], columns: [option('column-1', 'Coluna 1'), option('column-2', 'Coluna 2')] } },
    }),
    element('dropdown', 'selectionDropdown', 'Lista', { options: [option('option-1', 'Opção 1'), option('option-2', 'Opção 2')] }),
    element('scale', 'linearScale', 'Escala', { settings: { linearScale: { min: 1, max: 5 } } }),
    element('stars', 'starRating', 'Estrelas', { settings: { starRating: { max: 5 } } }),
    element('date', 'date', 'Data'),
    element('time', 'time', 'Hora'),
    element('schedule', 'scheduling', 'Agendamento', {
      settings: {
        scheduling: {
          timezone: 'America/Sao_Paulo',
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          inviteeMode: 'optional',
          maxInvitees: 1,
          availability: [{ id: 'window-1', date: today, startTime: '09:00', endTime: '10:00' }],
        },
      },
    }),
  ];
}

function element(
  id: string,
  type: FormElementType,
  title: string,
  overrides: Partial<FormElement> = {},
): FormElement {
  return {
    id,
    type,
    title,
    required: false,
    options: [],
    ...overrides,
  };
}

function option(id: string, label: string) {
  return { id, label };
}

function textEvent(value: string, kind: 'input' | 'textarea' = 'input'): Event {
  const target = document.createElement(kind);
  target.value = value;
  const event = new Event('input');
  Object.defineProperty(event, 'target', { value: target });
  return event;
}
