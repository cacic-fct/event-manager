import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RealtimeEventsService } from './realtime-events.service';

describe('RealtimeEventsService', () => {
  let eventSourceDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    eventSourceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
  });

  afterEach(() => {
    vi.useRealTimers();
    if (eventSourceDescriptor) {
      Object.defineProperty(globalThis, 'EventSource', eventSourceDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'EventSource');
    }
    TestBed.resetTestingModule();
  });

  it('does not schedule browser reconnects when EventSource is unavailable', () => {
    vi.useFakeTimers();
    Reflect.deleteProperty(globalThis, 'EventSource');
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(RealtimeEventsService);
    const subscription = service.watchEvent('event-1').subscribe();

    expect(() => vi.advanceTimersByTime(200)).not.toThrow();

    subscription.unsubscribe();
  });
});
