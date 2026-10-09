import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { RealtimeEventsService } from './realtime-events.service';

describe('RealtimeEventsService', () => {
  let eventSourceDescriptor: PropertyDescriptor | undefined;
  const refreshMe = vi.fn();
  const isAuthenticated = vi.fn();

  beforeEach(() => {
    eventSourceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
    refreshMe.mockReset().mockResolvedValue(undefined);
    isAuthenticated.mockReset().mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { refreshMe, isAuthenticated } },
      ],
    });
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
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    Reflect.deleteProperty(globalThis, 'EventSource');
    const service = TestBed.inject(RealtimeEventsService);
    const subscription = service.watchEvent('event-1').subscribe();

    expect(setTimeoutSpy).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });

  it('keeps the native stream during network reconnection and resumes delivering events', () => {
    installFakeEventSource();
    const service = TestBed.inject(RealtimeEventsService);
    const next = vi.fn();
    const subscription = service.watch().subscribe(next);
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.init).toEqual({ withCredentials: true });
    source.readyState = 0;
    source.emitError();
    source.emitError();
    expect(source.close).not.toHaveBeenCalled();
    expect(refreshMe).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);

    source.readyState = 1;
    source.emitMessage('invalid JSON');
    source.emitMessage({ type: 'heartbeat' });
    source.emitMessage({ type: 'event', eventId: 'event-1' });
    expect(next).toHaveBeenCalledExactlyOnceWith({ type: 'event', eventId: 'event-1' });
    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it.each([true, false])('recovers a terminal stream and preserves filters when authenticated=%s', async (authenticated) => {
    vi.useFakeTimers();
    installFakeEventSource();
    isAuthenticated.mockReturnValue(authenticated);
    const service = TestBed.inject(RealtimeEventsService);
    const next = vi.fn();
    const subscription = service.watchEvent('event-1').subscribe(next);
    await vi.advanceTimersByTimeAsync(100);
    const source = FakeEventSource.instances[0] as FakeEventSource;
    expect(new URL(source.url).searchParams.get('eventIds')).toBe('event-1');

    source.readyState = FakeEventSource.CLOSED;
    source.emitError();
    await vi.advanceTimersByTimeAsync(999);
    expect(refreshMe).toHaveBeenCalledTimes(authenticated ? 1 : 0);
    expect(source.close).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    const replacement = FakeEventSource.instances[1] as FakeEventSource;
    expect(replacement.url).toBe(source.url);
    replacement.emitMessage({ type: 'event', eventId: 'event-2' });
    replacement.emitMessage({ type: 'event', eventId: 'event-1' });
    expect(next).toHaveBeenCalledExactlyOnceWith({ type: 'event', eventId: 'event-1' });

    subscription.unsubscribe();
    expect(replacement.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels terminal recovery when the last watcher leaves', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    const service = TestBed.inject(RealtimeEventsService);
    const subscription = service.watch().subscribe();
    const source = FakeEventSource.instances[0] as FakeEventSource;
    source.readyState = FakeEventSource.CLOSED;
    source.emitError();

    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
