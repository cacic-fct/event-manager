import { Prisma } from '@prisma/client';
import {
  diffAuditRecords,
  formatAuditValue,
  normalizeAuditSnapshot,
  parseAuditChanges,
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
    expect(formatAuditValue([true, null, 'texto'])).toBe('Sim, vazio, texto');
    expect(parseAuditChanges([{ field: 'name', before: 'Ana', after: 'Ana Clara' }, { label: 'invalid' }])).toEqual([
      {
        field: 'name',
        label: undefined,
        before: 'Ana',
        after: 'Ana Clara',
      },
    ]);
  });
});
