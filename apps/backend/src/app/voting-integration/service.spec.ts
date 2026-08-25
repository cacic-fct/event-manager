import { VotingIntegrationService, startOfSaoPauloDay } from './service';

describe('VotingIntegrationService', () => {
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
