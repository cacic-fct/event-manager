import { BadRequestException } from '@nestjs/common';
import { CurrentUserEventAttendanceResolver } from './attendance.resolver';

describe('CurrentUserEventAttendanceResolver', () => {
  it('requires online attendance confirmation to target a publicly visible event', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const currentUserContext = {
      getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    };
    const frozenResources = {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new CurrentUserEventAttendanceResolver(
      prisma as never,
      currentUserContext as never,
      {} as never,
      {} as never,
      {} as never,
      frozenResources as never,
      {} as never,
    );

    await expect(
      resolver.confirmCurrentUserOnlineAttendance(
        { eventId: 'hidden-event', code: '123456' },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'hidden-event',
        deletedAt: null,
        publiclyVisible: true,
      },
      select: expect.any(Object),
    });
    expect(frozenResources.assertEventMutable).not.toHaveBeenCalled();
  });
});
