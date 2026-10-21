import { PersonTransferMatcherService, type TransferPersonReference } from './person-transfer-matcher.service';
const { jest } = import.meta;

describe('PersonTransferMatcherService', () => {
  const matcher = new PersonTransferMatcherService({} as never);

  it.each([
    { label: 'database ID', reference: { id: 'person-1' }, predicate: { id: 'person-1' } },
    { label: 'user ID', reference: { userId: 'user-1' }, predicate: { userId: 'user-1' } },
    {
      label: 'academic ID',
      reference: { academicId: '  RA123  ' },
      predicate: { academicId: { equals: 'RA123', mode: 'insensitive' } },
    },
  ])(
    'matches a unique person by $label while excluding deleted and merged records',
    async ({ reference, predicate }) => {
      const tx = { people: { findMany: jest.fn().mockResolvedValue([{ id: 'person-1' }]), create: jest.fn() } };

      await expect(matcher.match(reference, tx as never)).resolves.toEqual({ id: 'person-1' });

      expect(tx.people.findMany).toHaveBeenCalledWith({
        where: { ...predicate, deletedAt: null, mergedIntoId: null },
        select: { id: true },
        take: 501,
      });
      expect(tx.people.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { academicId: 'missing', name: 'Ana Silva' },
    { name: 'Ana Silva', academicId: 'missing' },
  ])('checks every identifier before proposing creation: %j', async (reference) => {
    const person = {
      id: 'person-1',
      name: 'Ana Silva',
      email: null,
      secondaryEmails: [],
      identityDocument: null,
      academicId: 'existing',
      createdAt: new Date(),
    };
    const tx = { people: { findMany: jest.fn(async ({ where }) => (where.OR ? [person] : [])) } };
    const result = await matcher.match(reference, tx as never);
    expect(result).toMatchObject({ missing: false, reviewIds: ['person-1'] });
    expect(tx.people.findMany).toHaveBeenCalledTimes(2);
  });

  it('never proposes recreation of inactive or merged identities', async () => {
    const tx = {
      people: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'deleted-person' }]),
      },
    };
    expect(await matcher.match({ academicId: 'reserved' }, tx as never)).toMatchObject({ missing: false });
  });

  it('loads account linkage when reviewing merge candidates', async () => {
    const tx = { people: { findMany: jest.fn().mockResolvedValue([]) } };

    await matcher.reviewCandidates(['person-1'], tx as never);

    expect(tx.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ userId: true }),
      }),
    );
  });

  it('offers creation only when all identifiers are absent and never for an unresolved database ID', async () => {
    const tx = { people: { findMany: jest.fn().mockResolvedValue([]) } };
    expect(await matcher.match({ name: 'Ana Silva', email: 'ana@example.com' }, tx as never)).toMatchObject({
      missing: true,
    });
    expect(await matcher.match({ id: 'missing-id', name: 'Ana Silva' }, tx as never)).toMatchObject({ missing: false });
  });

  it('matches Brazilian phone variants while keeping the candidate search active-only', async () => {
    const tx = { people: { findMany: jest.fn().mockResolvedValue([{ id: 'person-1' }]) } };

    await expect(matcher.match({ phone: '(11) 91234-5678' }, tx as never)).resolves.toEqual({ id: 'person-1' });

    const where = tx.people.findMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where).toMatchObject({ deletedAt: null, mergedIntoId: null });
    expect(where['phone']).toEqual({ in: expect.arrayContaining(['11912345678']) });
  });

  it('matches E.164 and formatted international phone numbers against canonical stored values', async () => {
    const tx = { people: { findMany: jest.fn().mockResolvedValue([{ id: 'international-person' }]) } };
    expect(await matcher.match({ phone: '+44 20 7183 8750' }, tx as never)).toEqual({ id: 'international-person' });
    expect(tx.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: { in: expect.arrayContaining(['+442071838750', '442071838750']) } }),
      }),
    );
  });

  it('uses normalized full names and refuses missing, empty, or unsupported identifiers', async () => {
    const person = {
      id: 'person-1',
      name: 'Ada Lovelace',
      email: null,
      secondaryEmails: [],
      phone: null,
      identityDocument: null,
      academicId: null,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const matchingTx = { people: { findMany: jest.fn().mockResolvedValue([person]), create: jest.fn() } };

    await expect(matcher.match({ name: ' ADA    LOVELACE ' }, matchingTx as never)).resolves.toEqual({
      id: 'person-1',
    });
    expect(matchingTx.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          mergedIntoId: null,
          OR: [{ name: { equals: 'ada lovelace', mode: 'insensitive' } }],
        }),
      }),
    );

    const unsupportedTx = { people: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() } };
    const unsupported = { password: 'private-value' } as unknown as TransferPersonReference;
    await expect(matcher.match(unsupported, unsupportedTx as never)).resolves.toHaveProperty('message');
    await expect(matcher.match({}, unsupportedTx as never)).resolves.toHaveProperty('message');
    await expect(matcher.match({ email: '   ' }, unsupportedTx as never)).resolves.toHaveProperty('message');
    expect(unsupportedTx.people.findMany).toHaveBeenCalledTimes(1);
    expect(unsupportedTx.people.create).not.toHaveBeenCalled();
  });
});
