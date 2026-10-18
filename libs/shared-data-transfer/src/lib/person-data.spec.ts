import { describe, expect, it } from 'vitest';
import { transferPersonDataError } from './person-data';

describe('person import data', () => {
  it.each([
    { academicId: 'RA123' },
    { identityDocument: 'RG123456' },
    { email: 'ana@example.com' },
    { phone: '+442071838750' },
    { phone: '+1 202-555-0123' },
    { phone: '(18) 91234-5678' },
    { phone: '+55 (18) 1234-5678' },
  ])('accepts a full name with another complete identifier: %j', (identifier) => {
    expect(transferPersonDataError({ name: 'Ana Silva', ...identifier })).toBeUndefined();
  });

  it.each([
    { name: 'Ana Silva' },
    { name: 'Ana', email: 'ana@example.com' },
    { name: 'Ana Silva', phone: '91234-5678' },
    { name: 'Ana Silva', email: 'invalid' },
    { name: 'Ana Silva', identityDocument: '...' },
    { name: 'Ana Silva', academicId: 'a'.repeat(41) },
  ])('rejects incomplete or invalid creation data: %j', (data) => {
    expect(transferPersonDataError(data)).toBeTypeOf('string');
  });

  it('allows a manual existing-person resolution without extra creation data', () => {
    expect(transferPersonDataError({ name: 'Ana Silva' }, false)).toBeUndefined();
  });
});
