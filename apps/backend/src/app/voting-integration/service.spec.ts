import { VotingIntegrationService, startOfSaoPauloDay } from './service';
const { jest } = import.meta;

describe('VotingIntegrationService', () => {
  it.each([
    { locationName: 'Auditório', locationDescription: null, isVirtual: false, expectedLocation: 'Auditório' },
    {
      locationName: 'Auditório',
      locationDescription: 'Bloco 5',
      isVirtual: false,
      expectedLocation: 'Auditório - Bloco 5',
    },
    { locationName: null, locationDescription: null, isVirtual: true, expectedLocation: 'Evento on-line' },
  ])('preserves $expectedLocation in linkable event locations', async ({ expectedLocation, ...location }) => {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const prisma = {
      event: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'event-1', name: 'Abertura', startDate, endDate, shouldCollectAttendance: true, ...location },
          ]),
      },
    };
    const service = new VotingIntegrationService(prisma as never, {} as never);

    await expect(service.listLinkableEvents(startDate)).resolves.toEqual([
      expect.objectContaining({ id: 'event-1', locationDescription: expectedLocation }),
    ]);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ locationName: true, locationDescription: true, isVirtual: true }),
      }),
    );
  });

  it('uses the Sao Paulo calendar day instead of the process timezone', () => {
    expect(startOfSaoPauloDay(new Date('2026-08-23T02:00:00.000Z'))).toEqual(new Date('2026-08-22T03:00:00.000Z'));
    expect(startOfSaoPauloDay(new Date('2026-08-23T04:00:00.000Z'))).toEqual(new Date('2026-08-23T03:00:00.000Z'));
  });

  it('matches formatted CPF and Brazilian phone values in legacy rows', async () => {
    const prisma = {
      people: {
        findMany: jest.fn().mockResolvedValue([
          {
            academicId: '20260001',
            name: 'Ana',
            email: 'ana@example.com',
            phone: '(18) 99999-0000',
            identityDocument: '529.982.247-25',
          },
        ]),
      },
    };
    const service = new VotingIntegrationService(prisma as never, {} as never);

    await expect(
      service.lookupPeopleByIdentifiers([
        { requestId: 'cpf', identifierType: 'cpf', identifierValue: '529.982.247-25' },
        { requestId: 'phone', identifierType: 'phone', identifierValue: '18 99999-0000' },
      ]),
    ).resolves.toEqual({
      people: [
        { requestId: 'cpf', enrollmentNumber: '20260001', name: 'Ana', email: 'ana@example.com' },
        { requestId: 'phone', enrollmentNumber: '20260001', name: 'Ana', email: 'ana@example.com' },
      ],
    });

    const where = prisma.people.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { identityDocument: { in: expect.arrayContaining(['52998224725', '529.982.247-25']) } },
        { phone: { in: expect.arrayContaining(['18999990000', '(18) 99999-0000']) } },
      ]),
    );
  });
});
