import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicEventInterest } from '@cacic-fct/event-manager-public-testing';
import { InterestApiService } from './interest-api.service';

describe('InterestApiService', () => {
  it('uses an idempotent interest mutation and announces successful changes', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(InterestApiService);
    const http = TestBed.inject(HttpTestingController);
    const changed = vi.fn();
    service.changes.subscribe(changed);
    const interest = createPublicEventInterest();
    const received = vi.fn();
    service.set('EVENT', 'event-1', true).subscribe(received);
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ targetType: 'EVENT', targetId: 'event-1', interested: true });
    expect(request.request.body.query).toContain('setCurrentUserInterest');
    request.flush({ data: { setCurrentUserInterest: interest } });
    expect(received).toHaveBeenCalledWith(interest);
    expect(changed).toHaveBeenCalledTimes(1);
    http.verify();
  });

  it('loads states for multiple cards in one request with bound target IDs', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(InterestApiService);
    const http = TestBed.inject(HttpTestingController);
    const received = vi.fn();
    service.getStates('MAJOR_EVENT', ['major-1', 'major-2']).subscribe(received);
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ targetType: 'MAJOR_EVENT', id0: 'major-1', id1: 'major-2' });
    const state = { interest: null, subscribed: false, enabled: true, endsAt: new Date(Date.now() + 60_000).toISOString() };
    request.flush({ data: { state0: state, state1: { ...state, enabled: false } } });
    expect(received).toHaveBeenCalledWith({ 'major-1': state, 'major-2': { ...state, enabled: false } });
    http.verify();
  });

  it('splits large lists to stay within the server alias limit', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(InterestApiService);
    const http = TestBed.inject(HttpTestingController);
    const received = vi.fn();
    const ids = Array.from({ length: 41 }, (_, index) => `major-${index}`);
    service.getStates('MAJOR_EVENT', ids).subscribe(received);
    const requests = http.match('/api/graphql');
    expect(requests).toHaveLength(2);
    const state = { interest: null, subscribed: false, enabled: true, endsAt: new Date(Date.now() + 60_000).toISOString() };
    for (const request of requests) {
      const aliases = Object.keys(request.request.body.variables).filter((key) => key.startsWith('id'));
      expect(aliases.length).toBeLessThanOrEqual(40);
      request.flush({ data: Object.fromEntries(aliases.map((_, index) => [`state${index}`, state])) });
    }
    expect(received).toHaveBeenCalledWith(Object.fromEntries(ids.map((id) => [id, state])));
    http.verify();
  });

  it('surfaces GraphQL failures without announcing a successful update', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(InterestApiService);
    const http = TestBed.inject(HttpTestingController);
    const changed = vi.fn();
    const failed = vi.fn();
    service.changes.subscribe(changed);
    service.set('EVENT', 'event-1', false).subscribe({ error: failed });
    http.expectOne('/api/graphql').flush({ errors: [{ message: 'Interest is disabled' }] });
    expect(failed).toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    http.verify();
  });
});
