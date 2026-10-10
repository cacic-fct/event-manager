import { Prisma } from '@prisma/client';
import {
  compactAuditSnapshots,
  diffAuditRecords,
  formatAuditValue,
  normalizeAuditSnapshot,
  parseAuditChanges,
  readAuditSnapshot,
  toNullableAuditJsonInput,
} from './audit-log.snapshots';

describe('audit log snapshot helpers', () => {
  it('stores only changed roots and subject references, retaining nested values needed for reversion', () => {
    const before = normalizeAuditSnapshot({
      id: 'subscription-1',
      personId: 'person-1',
      description: 'Unchanged content'.repeat(100),
      settings: { enabled: false, limit: 5 },
      updatedAt: new Date(),
      createdById: 'admin-1',
    });
    const after = normalizeAuditSnapshot({
      ...before,
      settings: { enabled: true, limit: 5 },
      updatedById: 'admin-2',
    });

    expect(compactAuditSnapshots(before, after, diffAuditRecords(before, after))).toEqual({
      before: { personId: 'person-1', createdById: 'admin-1', settings: { enabled: false, limit: 5 } },
      after: { personId: 'person-1', createdById: 'admin-1', settings: { enabled: true, limit: 5 } },
    });
    expect(before).toHaveProperty('createdById', 'admin-1');
    expect(after).not.toHaveProperty('updatedById');
  });

  it('preserves removals and explicit null values in compact snapshots', () => {
    const before = { userId: 'user-1', sourceKey: 'certificate:person-1', note: 'Old', value: 10 };
    const after = { userId: 'user-1', sourceKey: 'certificate:person-1', note: null };
    expect(compactAuditSnapshots(before, after, diffAuditRecords(before, after))).toEqual({ before, after });
  });

  it('keeps merge subject references without retaining unrelated person lists', () => {
    const before = { personAId: 'person-1', personBId: 'person-2', invitationPersonIds: ['person-3'], status: 'PENDING' };
    const after = { ...before, status: 'REJECTED' };
    expect(compactAuditSnapshots(before, after, diffAuditRecords(before, after))).toEqual({
      before: { personAId: 'person-1', personBId: 'person-2', status: 'PENDING' },
      after: { personAId: 'person-1', personBId: 'person-2', status: 'REJECTED' },
    });
  });

  it('normalizes snapshots and diffs nested values with field labels', () => {
    const before = normalizeAuditSnapshot({
      name: 'Ana',
      updatedAt: new Date('2026-06-22T12:00:00.000Z'),
      metadata: {
        externalRef: BigInt(1),
        empty: undefined,
      },
    });
    const after = normalizeAuditSnapshot({
      name: 'Ana Clara',
      updatedAt: new Date('2026-06-22T13:00:00.000Z'),
      metadata: {
        externalRef: BigInt(2),
      },
    });

    expect(diffAuditRecords(before, after)).toEqual([
      {
        field: 'metadata.externalRef',
        label: 'Metadata: Referência externa',
        before: '1',
        after: '2',
      },
      {
        field: 'name',
        label: 'Nome',
        before: 'Ana',
        after: 'Ana Clara',
      },
    ]);
  });

  it('formats stored changes and empty snapshots for GraphQL and Prisma', () => {
    expect(toNullableAuditJsonInput({})).toBe(Prisma.JsonNull);
    expect(readAuditSnapshot(['invalid'])).toBeNull();
    expect(formatAuditValue(42)).toBe('42');
    expect(formatAuditValue(BigInt('9007199254740993'))).toBe('9007199254740993');
    expect(formatAuditValue([true, null, 'texto'])).toBe('Sim, vazio, texto');
    expect(
      parseAuditChanges([
        { field: 'name', label: 'Nome', before: 'Ana', after: 'Ana Clara' },
        { field: 'email', before: null, after: 'ana@example.com' },
        { label: 'invalid' },
      ]),
    ).toEqual([
      {
        field: 'name',
        label: 'Nome',
        before: 'Ana',
        after: 'Ana Clara',
      },
      {
        field: 'email',
        label: undefined,
        before: null,
        after: 'ana@example.com',
      },
    ]);
  });
});
