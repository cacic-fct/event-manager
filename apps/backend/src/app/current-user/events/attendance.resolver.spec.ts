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

  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'prefixes subscriber CSV values starting with %s to prevent spreadsheet formula execution',
    async (prefix) => {
      const prisma = {
        event: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'event-1',
            name: 'Evento de teste',
            endDate: new Date('2099-01-01T00:00:00.000Z'),
            shouldProvideSubscriberListToLecturer: true,
            lecturers: [{ personId: 'lecturer-1' }],
          }),
        },
        eventSubscription: {
          findMany: jest.fn().mockResolvedValue([
            {
              person: {
                id: 'person-1',
                name: `${prefix}HYPERLINK("https://example.com")`,
                identityDocument: `${prefix}SUM(1,2)`,
              },
            },
          ]),
        },
        majorEventSubscriptionEventSelection: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const currentUserContext = {
        requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'lecturer-1' }),
      };
      const authorizationPolicy = {
        assertLecturerCanViewSubscriberList: jest.fn(),
      };
      const resolver = new CurrentUserEventAttendanceResolver(
        prisma as never,
        currentUserContext as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        authorizationPolicy as never,
      );

      const result = await resolver.downloadCurrentUserEventSubscriberList('event-1', {} as never);
      const csv = Buffer.from(result.contentBase64, 'base64').toString('utf8');

      expect(csv).toBe(
        `\uFEFFNome,CPF\n${escapeExpectedCsvCell(`'${prefix}HYPERLINK("https://example.com")`)},${escapeExpectedCsvCell(`'${prefix}SUM(1,2)`)}\n`,
      );
    },
  );
});

function escapeExpectedCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
