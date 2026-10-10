import { ConflictException } from '@nestjs/common';
import { assertTicketConfigVersionUnchanged } from './ticket-config-concurrency';

describe('ticket config optimistic concurrency guard', () => {
  it('rejects a concurrent config create after permission selection', () => {
    expect(() => assertTicketConfigVersionUnchanged(null, { id: 'concurrent-config', updatedAt: new Date() }))
      .toThrow(ConflictException);
  });

  it('rejects stale updates instead of overwriting another admin save', () => {
    const authorizedVersion = { id: 'config-1', updatedAt: new Date(Date.now() - 1_000) };
    const latestUpdatedAt = new Date(Date.now());

    expect(() => assertTicketConfigVersionUnchanged(authorizedVersion, { id: 'config-1', updatedAt: latestUpdatedAt }))
      .toThrow(ConflictException);
  });

  it('rejects a replacement config even when a recreated timestamp matches', () => {
    const version = new Date();

    expect(() => assertTicketConfigVersionUnchanged(
      { id: 'old-config', updatedAt: version },
      { id: 'replacement-config', updatedAt: version },
    )).toThrow(ConflictException);
  });

  it('allows the transaction when the permission-selected version is still current', () => {
    const version = new Date();

    expect(() => assertTicketConfigVersionUnchanged({ id: 'config-1', updatedAt: version }, { id: 'config-1', updatedAt: version })).not.toThrow();
    expect(() => assertTicketConfigVersionUnchanged(null, null)).not.toThrow();
  });
});
