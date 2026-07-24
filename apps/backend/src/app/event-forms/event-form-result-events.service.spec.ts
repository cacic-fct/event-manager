import { EventFormResultEventsService } from './event-form-result-events.service';

describe('EventFormResultEventsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits result delta events once per form id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const replay = {
      scope: jest.fn(() => 'event-form-results:scope'),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EventFormResultEventsService(replay as never);
    const events: unknown[] = [];
    const subscription = service.watchResults('form-1').subscribe((event) => events.push(event));

    await service.emitResultsDeltas(['form-1', 'form-1', 'form-2']);

    expect(events).toEqual([
      {
        type: 'message',
        data: {
          formId: 'form-1',
          updatedAt: '2026-07-01T12:00:00.000Z',
        },
      },
    ]);
    expect(replay.record).toHaveBeenCalledWith(
      'event-form-results:scope',
      expect.objectContaining({ data: expect.objectContaining({ formId: 'form-1' }) }),
    );
    subscription.unsubscribe();
  });
});
