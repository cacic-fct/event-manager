import { ForbiddenException, MessageEvent } from '@nestjs/common';
import { EventFormTargetType } from '@cacic-fct/shared-data-types';
import { firstValueFrom, Observable, of } from 'rxjs';
import { EventFormsService } from './event-forms.service';
import { EventFormsController } from './event-forms.controller';
import { SseReplayService } from '../realtime/sse-replay.service';

describe('EventFormsController', () => {
  const message = {
    data: {
      formId: 'form-1',
      updatedAt: '2026-07-24T00:00:00.000Z',
    },
  } satisfies MessageEvent;
  const request = { user: { sub: 'user-1' } };
  const input = {
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: undefined,
  };

  it('authorizes before replaying the shared form-result journal', async () => {
    const forms = {
      assertCurrentUserLiveResultsAccess: jest.fn().mockResolvedValue(undefined),
      watchCurrentUserResults: jest.fn(() => of(message)),
    };
    const replay = {
      scope: jest.fn(() => 'event-form-results:scope'),
      replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: Observable<MessageEvent>) => source),
    };
    const controller = new EventFormsController(forms as unknown as EventFormsService, replay as unknown as SseReplayService);

    await expect(
      firstValueFrom(
        controller.streamCurrentUserResults(
          input.formId,
          input.targetType,
          input.eventId,
          input.majorEventId,
          request as never,
          'sse1.cursor',
        ),
      ),
    ).resolves.toEqual(message);

    expect(forms.assertCurrentUserLiveResultsAccess).toHaveBeenCalledWith({ req: request }, input);
    expect(replay.scope).toHaveBeenCalledWith('event-form-results', input.formId);
    expect(replay.replay).toHaveBeenCalledWith('event-form-results:scope', 'sse1.cursor', expect.anything());
    expect(forms.watchCurrentUserResults).toHaveBeenCalledWith({ req: request }, input);
  });

  it('does not read replay events before current-user access is authorized', async () => {
    const forms = {
      assertCurrentUserLiveResultsAccess: jest.fn().mockRejectedValue(new ForbiddenException()),
      watchCurrentUserResults: jest.fn(),
    };
    const replay = {
      scope: jest.fn(),
      replay: jest.fn(),
    };
    const controller = new EventFormsController(forms as unknown as EventFormsService, replay as unknown as SseReplayService);

    await expect(
      firstValueFrom(
        controller.streamCurrentUserResults(
          input.formId,
          input.targetType,
          input.eventId,
          input.majorEventId,
          request as never,
          undefined,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(replay.scope).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
    expect(forms.watchCurrentUserResults).not.toHaveBeenCalled();
  });
});
