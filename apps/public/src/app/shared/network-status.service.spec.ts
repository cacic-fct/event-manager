import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NetworkStatusService } from './network-status.service';

describe('NetworkStatusService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts as online on the server and completes watchers immediately', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(NetworkStatusService);
    const completeSpy = vi.fn();
    service.watchStatusChanges().subscribe({ complete: completeSpy });

    expect(service.status()).toBe('online');
    expect(service.isOnline()).toBe(true);
    expect(completeSpy).toHaveBeenCalled();
  });

  it('tracks browser online and offline events', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(NetworkStatusService);
    const values: string[] = [];
    const subscription = service.watchStatusChanges().subscribe((status) => values.push(status));

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    subscription.unsubscribe();

    expect(values).toEqual(['offline', 'online']);
    expect(service.status()).toBe('online');
  });
});
