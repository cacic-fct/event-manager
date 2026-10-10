import { describe, expect, it } from 'vitest';
import { AdminShellComponent } from './admin-shell.component';

describe('AdminShellComponent operation selection', () => {
  it.each([
    '/tickets/event/event-1',
    '/tickets/major-event/major-event-1',
    '/admin/tickets/event/event-1',
  ])('keeps the tickets operation selected for %s', (url) => {
    const component = Object.create(AdminShellComponent.prototype) as { activeUrl: () => string };
    component.activeUrl = () => url;
    const currentOperationId = Reflect.get(component, 'currentOperationId') as () => string | undefined;

    expect(currentOperationId.call(component)).toBe('tickets');
  });
});
