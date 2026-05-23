import { UnprocessableEntityException } from '@nestjs/common';
import { buildTargetMigrationData, mergeSecondaryEmails, normalizeMigrateFields } from './migration';

describe('merge candidate migration helpers', () => {
  it('deduplicates requested migrate fields while preserving order', () => {
    expect(normalizeMigrateFields(['EMAIL', 'NAME', 'EMAIL'])).toEqual(['EMAIL', 'NAME']);
    expect(normalizeMigrateFields(null)).toEqual([]);
  });

  it('builds target update data and keeps source/target primary emails as secondary values', () => {
    const updateData = buildTargetMigrationData(
      ['EMAIL', 'NAME', 'IDENTITY_DOCUMENT', 'ACADEMIC_ID', 'USER_ID', 'EXTERNAL_REF'],
      people({
        id: 'target',
        name: 'Target Name',
        email: 'target@example.com',
        secondaryEmails: ['old@example.com'],
      }),
      people({
        id: 'source',
        name: ' Source Name ',
        email: ' source@example.com ',
        identityDocument: ' 52998224725 ',
        academicId: ' RA-1 ',
        userId: ' user-source ',
        externalRef: ' ext-source ',
      }),
    );

    expect(updateData).toEqual({
      secondaryEmails: ['old@example.com', 'target@example.com'],
      name: 'Source Name',
      email: 'source@example.com',
      identityDocument: '52998224725',
      academicId: 'RA-1',
      userId: 'user-source',
      externalRef: 'ext-source',
    });
  });

  it('returns the original secondary emails array when no merge is needed', () => {
    const target = people({
      id: 'target',
      email: 'target@example.com',
      secondaryEmails: ['source@example.com'],
    });
    const source = people({
      id: 'source',
      email: 'SOURCE@example.com',
    });

    expect(mergeSecondaryEmails([], target, source)).toBe(target.secondaryEmails);
  });

  it('rejects null or blank source values for selected fields', () => {
    expect(() => buildTargetMigrationData(['EMAIL'], people({ id: 'target' }), people({ id: 'source' }))).toThrow(
      UnprocessableEntityException,
    );
    expect(() =>
      buildTargetMigrationData(['NAME'], people({ id: 'target' }), people({ id: 'source', name: '   ' })),
    ).toThrow(UnprocessableEntityException);
  });
});

type PersonMock = ReturnType<typeof peopleShape>;

function people(overrides: Partial<PersonMock>): PersonMock {
  return {
    ...peopleShape(),
    ...overrides,
  };
}

function peopleShape() {
  return {
    id: 'person',
    name: 'Person Name',
    email: null,
    secondaryEmails: [] as string[],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null,
    createdAt: new Date('2026-05-21T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    updatedById: null,
    isCPF: null,
  };
}
