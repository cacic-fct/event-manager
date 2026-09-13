import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createPublicEventForm, createPublicEventFormLink, createPublicEventInterest } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { InterestApiService } from '../interests/interest-api.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { TargetFormLinks } from './target-form-links';

describe('interest form availability integration', () => {
  it('reloads the authorized forms after interest changes and removes forms when no longer eligible', async () => {
    TestBed.configureTestingModule({
      imports: [TargetFormLinks],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
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
