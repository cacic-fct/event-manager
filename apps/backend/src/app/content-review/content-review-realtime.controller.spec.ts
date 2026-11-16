import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of, toArray } from 'rxjs';
import { ContentReviewRealtimeController } from './content-review-realtime.controller';

function setup() {
  const events = of(
    { id: 'profile', data: { eventId: null } },
    { id: 'private', data: { eventId: 'private' } },
    { id: 'visible', data: { eventId: 'visible', revision: 'opaque' } },
    { data: { type: 'heartbeat' } },
  );
  const materialScope = { deletedAt: null, eventGroupId: 'allowed' };
  const queueAccess = jest.fn<() => Promise<unknown>>().mockResolvedValue({ profilePermission: null, materialScope });
  const findFirst = jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'visible' });
  const replay = jest.fn().mockReturnValue(events);
  const controller = new ContentReviewRealtimeController(
    { getAuthenticatedUser: () => ({ sub: 'reviewer' }) } as never,
    { queueAccess } as never,
    { scope: () => 'review-stream' } as never,
    { watch: () => events } as never,
    { replay } as never,
    { event: { findFirst } } as never,
  );
  return { controller, events, findFirst, materialScope, queueAccess, replay };
}

describe('content review SSE', () => {
  it('checks replayed changes against queue scope and sends only an opaque refresh signal', async () => {
    const { controller, events, findFirst, materialScope, replay } = setup();
    await expect(lastValueFrom(controller.stream({} as never, 'cursor').pipe(toArray()))).resolves.toEqual([
      { id: 'visible', data: { type: 'CONTENT_REVIEWS_INVALIDATED' } },
      { data: { type: 'heartbeat' } },
    ]);
    expect(replay).toHaveBeenCalledWith('review-stream', 'cursor', events);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'private', AND: [materialScope] },
      select: { id: true },
    });
  });

  it('rejects callers without queue access before opening replay', async () => {
    const { controller, queueAccess, replay } = setup();
    queueAccess.mockRejectedValue(new ForbiddenException());
    await expect(lastValueFrom(controller.stream({} as never, undefined))).rejects.toThrow(ForbiddenException);
    expect(replay).not.toHaveBeenCalled();
  });
});
