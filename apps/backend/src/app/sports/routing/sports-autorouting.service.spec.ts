import { SportsAutoroutingService } from './sports-autorouting.service';

describe('SportsAutoroutingService', () => {
  it('only routes active approved players to a match wallet', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SportsAutoroutingService({
      sportsMatch: { findFirst, findMany: jest.fn().mockResolvedValue([]) },
      sportsTeamRepresentative: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.resolveCurrentUserRoute('person-1')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rosters: {
            some: expect.objectContaining({
              status: 'APPROVED',
              entries: {
                some: expect.objectContaining({
                  status: 'APPROVED',
                  registrationMember: expect.objectContaining({
                    eligibility: 'ELIGIBLE',
                    teamMember: expect.objectContaining({
                      status: 'APPROVED',
                      participant: expect.objectContaining({
                        personId: 'person-1',
                        status: 'ACTIVE',
                      }),
                    }),
                  }),
                }),
              },
            }),
          },
        }),
      }),
    );
  });

  it('does not route representatives to closed tournaments', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new SportsAutoroutingService({
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sportsTeamRepresentative: { findFirst },
    } as never);

    await expect(service.resolveCurrentUserRoute('person-1')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: {
            deletedAt: null,
            tournament: {
              deletedAt: null,
              finishedAt: null,
              status: { notIn: ['FINISHED', 'CANCELED'] },
            },
          },
        }),
      }),
    );
  });
});
