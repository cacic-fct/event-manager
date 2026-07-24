import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { PublicEventFormApiService } from './event-form-api.service';

describe('PublicEventFormApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches current-user results with all supported query parameters', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(PublicEventFormApiService);
    const notification = firstValueFrom(
      service.watchCurrentUserResults({
        formId: 'form / 1',
        targetType: 'EVENT',
        eventId: 'event / 1',
        majorEventId: 'major / 1',
      }),
    );
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe(
      '/api/event-forms/form%20%2F%201/current-user-results/events?targetType=EVENT&eventId=event+%2F+1&majorEventId=major+%2F+1',
    );
    source.emitMessage();

    await expect(notification).resolves.toBeUndefined();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('omits optional result scope parameters when they are empty', () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });

    TestBed.inject(PublicEventFormApiService)
      .watchCurrentUserResults({ formId: 'form-1', targetType: 'MAJOR_EVENT' })
      .subscribe();

    expect(FakeEventSource.instances[0]?.url).toBe(
      '/api/event-forms/form-1/current-user-results/events?targetType=MAJOR_EVENT',
    );
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emitMessage(): void {
    this.onmessage?.({ data: '{}' } as MessageEvent<string>);
  }
}

function installFakeEventSource(): void {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
}
