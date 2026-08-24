import '@angular/compiler';
import { EventFormBuilderComponent } from './event-form-builder.component';

describe('EventFormBuilderComponent', () => {
  it('adds fields and choice options without placeholder text', () => {
    const emit = vi.fn();
    const component = Object.create(EventFormBuilderComponent.prototype) as EventFormBuilderComponent;
    Object.assign(component, {
      elements: () => [],
      elementsChange: { emit },
      addType: () => 'singleChoice',
    });

    component.addElement();

    const [createdElement] = emit.mock.calls[0]?.[0] ?? [];
    expect(createdElement).toEqual(
      expect.objectContaining({
        title: '',
        options: [expect.objectContaining({ label: '' }), expect.objectContaining({ label: '' })],
      }),
    );

    Object.assign(component, { elements: () => [createdElement] });
    component.addOption(createdElement.id, 'options');

    expect(emit).toHaveBeenLastCalledWith([
      expect.objectContaining({
        options: [
          expect.objectContaining({ label: '' }),
          expect.objectContaining({ label: '' }),
          expect.objectContaining({ label: '' }),
        ],
      }),
    ]);
  });
});
