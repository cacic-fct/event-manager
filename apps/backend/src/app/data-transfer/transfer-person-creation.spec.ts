import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertCompatiblePersonChanges,
  plannedPersonMerges,
  validatePersonDecisions,
} from './transfer-person-creation';
import type { ResolvedTransferResource } from './data-transfer-adapter';

function creation(id: string, data: Record<string, string>): ResolvedTransferResource {
  return { personCreation: { id, data: { name: 'Ana Silva', ...data } } } as ResolvedTransferResource;
}
function merge(id: string, secondaryEmails: string[], phone?: string): ResolvedTransferResource {
  return {
    personMerge: { id, revision: 'before', data: { secondaryEmails, ...(phone ? { phone } : {}) } },
  } as ResolvedTransferResource;
}

describe('person import preflight', () => {
  it.each(
    [
      [{ key: 'a'.repeat(64), action: 'create', data: { userId: 'forbidden' } }],
      [{ key: 'a'.repeat(64), action: 'merge', data: {} }],
      [{ key: 'a'.repeat(64), action: ['create'], data: {} }],
      [{ key: 'a'.repeat(64), action: 'create', data: { email: ' ' } }],
      [
        { key: 'a'.repeat(64), action: 'skip' },
        { key: 'a'.repeat(64), action: 'skip' },
      ],
    ].map((decisions) => ({ decisions })),
  )('rejects malformed or duplicate confirmations before planning: %j', ({ decisions }) => {
    expect(() => validatePersonDecisions(decisions)).toThrow(BadRequestException);
  });

  it('rejects overlapping identifiers between creation and merge, including phone variants', () => {
    expect(() =>
      assertCompatiblePersonChanges([
        creation('new', { email: 'ana@example.com' }),
        merge('existing', ['ana@example.com']),
      ]),
    ).toThrow(ConflictException);
    expect(() =>
      assertCompatiblePersonChanges([
        creation('one', { phone: '(18) 91234-5678' }),
        creation('two', { phone: '+55 (18) 91234-5678' }),
      ]),
    ).toThrow(ConflictException);
  });

  it('permits distinct people with the same name and different identifiers', () => {
    expect(() =>
      assertCompatiblePersonChanges([
        creation('one', { identityDocument: 'AB123' }),
        creation('two', { identityDocument: 'CD123' }),
      ]),
    ).not.toThrow();
  });

  it('combines secondary email additions across different event rows without dropping addresses', () => {
    const combined = plannedPersonMerges([
      merge('one', ['old@example.com', 'first@example.com']),
      merge('one', ['old@example.com', 'second@example.com']),
    ]);
    expect(combined.get('one')?.data.secondaryEmails).toEqual([
      'old@example.com',
      'first@example.com',
      'second@example.com',
    ]);
    expect(() => plannedPersonMerges([merge('one', [], '1812345678'), merge('one', [], '18912345678')])).toThrow(
      ConflictException,
    );
  });
});
