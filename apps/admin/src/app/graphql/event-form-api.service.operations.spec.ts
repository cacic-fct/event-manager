import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { EventFormApiService } from './event-form-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('EventFormApiService operation contracts', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: EventFormApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn(() => of({ eventFormPreviousSubscriberCount: 12 })),
    };

    TestBed.configureTestingModule({
      providers: [EventFormApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(EventFormApiService);
  });

  it('maps previous-subscriber count input and response extraction', async () => {
    const input = {
      formId: 'form-1',
      linkId: 'link-1',
      targetType: 'EVENT' as const,
      eventId: 'event-1',
      majorEventId: null,
    };

    await expect(firstValueFrom(service.previousSubscriberCount(input))).resolves.toBe(12);

    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query EventFormPreviousSubscriberCount'),
      {
        input,
      },
    );
    const query = graphqlHttp.request.mock.calls[0][0] as string;
    expect(query).toContain('eventFormPreviousSubscriberCount');
  });

  it('propagates previous-subscriber count failures', async () => {
    const error = new Error('subscriber count unavailable');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(
      firstValueFrom(service.previousSubscriberCount({ targetType: 'MAJOR_EVENT', majorEventId: 'major-1' })),
    ).rejects.toBe(error);
  });
});
