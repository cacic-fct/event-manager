import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AttendanceCollectionApiService } from './attendance-collection-api.service';

describe('AttendanceCollectionApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches the encoded collection feed through the replayable EventSource helper', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(AttendanceCollectionApiService);
    const feed = firstValueFrom(service.watchFeed('event / 1'));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/attendance-collection/events/event%20%2F%201/feed/events');
    source.emitMessage({ type: 'event-attendance-scanner-feed', attendances: [] });

    await expect(feed).resolves.toEqual([]);
    expect(source.close).toHaveBeenCalledOnce();
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

  emitMessage(data: object): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

function installFakeEventSource(): void {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
}
