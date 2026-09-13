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
