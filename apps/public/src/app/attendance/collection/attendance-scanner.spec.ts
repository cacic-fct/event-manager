import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AttendanceScanner } from './attendance-scanner';

describe('AttendanceScanner labels', () => {
  it('labels standalone subscribers with confirmed status', () => {
    const component = Object.create(AttendanceScanner.prototype) as {
      statusLabel: (status: string | null | undefined) => string;
    };

    expect(component.statusLabel('CONFIRMED')).toBe('Inscrição confirmada');
  });

  it('labels standalone attendees without a subscription as not subscribed', () => {
    const component = Object.create(AttendanceScanner.prototype) as {
      statusLabel: (status: string | null | undefined) => string;
    };

    expect(component.statusLabel(null)).toBe('Não inscrito');
    expect(component.statusLabel(undefined)).toBe('Não inscrito');
  });

  it('shows an error when the realtime attendance feed fails', () => {
    const snackbar = { open: vi.fn() };
    const component = Object.create(AttendanceScanner.prototype) as AttendanceScanner;
    Object.assign(component, {
      api: {
        listCollectionEvents: () => of([{ eventId: 'event-1' }]),
        listFeed: () => of([]),
        watchFeed: () => throwError(() => new Error('Stream failed')),
      },
      attendances: signal([]),
      auth: { user: () => null },
      destroyRef: { onDestroy: () => undefined },
      ensurePreciseLocation: () => Promise.resolve(),
      event: signal(null),
      queuedAttendances: signal([]),
      route: { snapshot: { paramMap: { get: () => 'event-1' } } },
      snackbar,
    });

    component.ngOnInit();

    expect(snackbar.open).toHaveBeenCalledWith('Não foi possível acompanhar as presenças em tempo real.', 'Fechar', {
      duration: 3500,
    });
  });
});
