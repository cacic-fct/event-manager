import { Prisma } from '@prisma/client';
import {
  diffAuditRecords,
  formatAuditValue,
  normalizeAuditSnapshot,
  parseAuditChanges,
  readAuditSnapshot,
  toNullableAuditJsonInput,
} from './audit-log.snapshots';

describe('audit log snapshot helpers', () => {
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
        label: 'Metadata · Referência externa',
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
