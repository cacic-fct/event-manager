import { CertificateTargetsService } from './certificate-targets.service';

describe('CertificateTargetsService', () => {
  it('filters issuable events to accessible certificate config targets', async () => {
    const prisma = createPrisma();
    const service = new CertificateTargetsService(prisma as never);
    const accessibleTargets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    await service.listIssuableEvents('cert', 5, 10, accessibleTargets);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { id: { in: ['event-1'] } },
                { majorEventId: { in: ['major-1'] } },
                { eventGroupId: { in: ['group-1'] } },
              ],
            },
          ],
        }),
        skip: 5,
        take: 10,
      }),
    );
  });

  it('filters event group and major event target pickers to matching grant scopes', async () => {
    const prisma = createPrisma();
    const service = new CertificateTargetsService(prisma as never);
    const accessibleTargets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    await service.listIssuableEventGroups(undefined, 0, 20, accessibleTargets);
    await service.listIssuableMajorEvents(undefined, 0, 20, accessibleTargets);

    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['group-1'] },
        }),
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['major-1'] },
        }),
      }),
    );
  });
});

function createPrisma() {
  return {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventGroup: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    majorEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
  };
}
