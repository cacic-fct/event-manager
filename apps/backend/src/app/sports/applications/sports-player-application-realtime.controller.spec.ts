import { MessageEvent } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { SportsPlayerApplicationRealtimeController } from './sports-player-application-realtime.controller';

describe('SportsPlayerApplicationRealtimeController', () => {
  const currentUser = { requireCurrentPerson: jest.fn() };
  const replay = { replay: jest.fn() };
  const realtime = { watch: jest.fn() };
  const applicationRealtime = { scope: jest.fn() };
  const event: MessageEvent = { id: 'cursor-2', data: { applicationId: 'application-1' } };
  let controller: SportsPlayerApplicationRealtimeController;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    applicationRealtime.scope.mockReturnValue('sports-application-person:person-1');
    realtime.watch.mockReturnValue(of());
    replay.replay.mockReturnValue(of(event));
    controller = new SportsPlayerApplicationRealtimeController(
      currentUser as never,
      replay as never,
      realtime as never,
      applicationRealtime as never,
    );
  });

  it('resolves the authenticated person before disclosing replayed application events', async () => {
    const request = { user: { sub: 'user-1' } };

    await expect(firstValueFrom(controller.streamCurrentUserApplications('cursor-1', request as never))).resolves.toBe(
      event,
    );

    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(applicationRealtime.scope).toHaveBeenCalledWith('person-1');
    expect(realtime.watch).toHaveBeenCalledWith('sports-application-person:person-1');
    expect(replay.replay).toHaveBeenCalledWith('sports-application-person:person-1', 'cursor-1', expect.any(Object));
  });

  it('does not create a stream when authentication cannot resolve a person', async () => {
    currentUser.requireCurrentPerson.mockRejectedValue(new Error('missing person'));

    await expect(firstValueFrom(controller.streamCurrentUserApplications(undefined, {} as never))).rejects.toThrow(
      'missing person',
    );
    expect(applicationRealtime.scope).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });
});
