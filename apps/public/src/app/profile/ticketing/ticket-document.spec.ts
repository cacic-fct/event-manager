import {
  isCpfFormattedDocument,
  normalizeTicketIdentityDocument,
  redactIdentityDocument,
  ticketIdentityDocumentValidator,
} from './ticket-document';

describe('ticket identity documents', () => {
  it('accepts a valid CPF and normalizes it to digits before sending', () => {
    expect(ticketIdentityDocumentValidator({ value: '529.982.247-25' } as never)).toBeNull();
    expect(normalizeTicketIdentityDocument('529.982.247-25')).toBe('52998224725');
  });

  it('flags CPF-shaped invalid input without rejecting passport numbers', () => {
    expect(ticketIdentityDocumentValidator({ value: '123.456.789-01' } as never)).toEqual({ invalidCpf: true });
    expect(isCpfFormattedDocument('P1234567')).toBe(false);
    expect(ticketIdentityDocumentValidator({ value: 'P1234567' } as never)).toBeNull();
  });

  it('redacts CPF digits and preserves a passport in full', () => {
    expect(redactIdentityDocument('52998224725')).toBe('•••.982.247-••');
    expect(redactIdentityDocument('XK1234567')).toBe('XK1234567');
  });
});
