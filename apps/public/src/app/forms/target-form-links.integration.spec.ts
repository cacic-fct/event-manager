import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createPublicEventForm, createPublicEventFormLink, createPublicEventInterest } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { InterestApiService } from '../interests/interest-api.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { TargetFormLinks } from './target-form-links';

describe('interest form availability integration', () => {
  it('refreshes availability from replayable SSE, ignores heartbeats, and closes the stream offline or on destruction', async () => {
    const restoreEventSource = installFakeEventSource();
    const online = signal(true);
    TestBed.configureTestingModule({
      imports: [TargetFormLinks],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: signal(true), user: signal({ sub: 'user-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: online } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TargetFormLinks);
    fixture.componentRef.setInput('targetType', 'MAJOR_EVENT');
    fixture.componentRef.setInput('targetId', 'major-1');
    try {
      fixture.detectChanges();
      await fixture.whenStable();
      http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [] } });
      const source = FakeEventSource.instances[0] as FakeEventSource;
      expect(source.url).toBe('/api/realtime/public/catalog/events');
      source.emitMessage({ type: 'heartbeat' });
      http.expectNone('/api/graphql');
      const now = Date.now();
      const form = createPublicEventForm({ name: 'Prepare sua visita', resultsPublic: false, links: [
        createPublicEventFormLink({ targetType: 'MAJOR_EVENT', majorEventId: 'major-1', eventId: null,
          availableFrom: new Date(now + 60_000).toISOString(),
          availableUntil: new Date(now + 120_000).toISOString(),
        }),
      ] });
      vi.useFakeTimers();
      vi.advanceTimersByTime(60_000);
      http.expectNone('/api/graphql');
      vi.setSystemTime(now + 60_000);
      source.emitMessage({ type: 'PUBLIC_TIME_BOUNDARY' });
      http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [form] } });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Prepare sua visita');
      vi.setSystemTime(now + 120_000);
      source.emitMessage({ type: 'PUBLIC_TIME_BOUNDARY' });
      http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [form] } });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('a')).toBeNull();
      vi.useRealTimers();
      online.set(false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(source.close).toHaveBeenCalledOnce();
      http.expectNone('/api/graphql');
      online.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [] } });
      const reconnectedSource = FakeEventSource.instances[1] as FakeEventSource;
      fixture.destroy();
      expect(reconnectedSource.close).toHaveBeenCalledOnce();
      http.verify();
    } finally {
      fixture.destroy();
      vi.useRealTimers();
      restoreEventSource();
    }
  });

  it('reloads the authorized forms after interest changes and removes forms when no longer eligible', async () => {
    TestBed.configureTestingModule({
      imports: [TargetFormLinks],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: signal(true), user: signal({ sub: 'user-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: signal(true) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TargetFormLinks);
    fixture.componentRef.setInput('targetType', 'MAJOR_EVENT');
    fixture.componentRef.setInput('targetId', 'major-1');
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [] } });

    TestBed.inject(InterestApiService).set('MAJOR_EVENT', 'major-1', true).subscribe();
    http.expectOne('/api/graphql').flush({ data: { setCurrentUserInterest: createPublicEventInterest({ majorEventId: 'major-1' }) } });
    const form = createPublicEventForm({ name: 'Prepare sua visita', links: [
      createPublicEventFormLink({ targetType: 'MAJOR_EVENT', majorEventId: 'major-1', eventId: null, audiences: ['INTERESTED'] }),
    ] });
    http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [form] } });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Prepare sua visita');

    TestBed.inject(InterestApiService).set('MAJOR_EVENT', 'major-1', false).subscribe();
    http.expectOne('/api/graphql').flush({ data: { setCurrentUserInterest: null } });
    http.expectOne('/api/graphql').flush({ data: { currentUserEventForms: [] } });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    http.verify();
  });
});
