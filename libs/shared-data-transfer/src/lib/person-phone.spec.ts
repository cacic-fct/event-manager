import { describe, expect, it } from 'vitest';
import { normalizeTransferPhone, transferPhoneCandidates } from './person-phone';

describe('international import phones', () => {
  it.each([
    ['+44 20 7183 8750', '+442071838750'],
    ['+1 202-555-0123', '+12025550123'],
    ['+55 (18) 91234-5678', '+5518912345678'],
    ['(18) 91234-5678', '+5518912345678'],
  ])('normalizes %s as %s', (input, expected) => {
    expect(normalizeTransferPhone(input)).toBe(expected);
    expect(transferPhoneCandidates(input)).toContain(expected);
  });
  it.each(['91234-5678', '+999123456789', 'call me at +442071838750', '+44 20 7183 8750 ext. 2'])(
    'rejects incomplete or ambiguous input: %s',
    (input) => {
      expect(normalizeTransferPhone(input)).toBeUndefined();
    },
  );
});
