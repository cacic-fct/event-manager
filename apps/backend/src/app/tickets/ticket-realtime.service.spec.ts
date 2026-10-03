import { TicketRealtimeInvalidationType, TicketRealtimeScopeType } from '@prisma/client';
import { TicketRealtimeService } from './ticket-realtime.service';

describe('ticket realtime outbox', () => {
  it('writes user-scoped invalidations and one PII-free event scope in the caller transaction', async () => {
    const tx = { ticketRealtimeOutbox: { createMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    const service = new TicketRealtimeService({} as never, {} as never);

    await service.enqueueForUsers(
      tx as never,
      ['user-a', 'user-a', null, 'user-b'],
      {
        type: TicketRealtimeInvalidationType.TRANSFERS_CHANGED,
        eventId: 'event-1',
        ticketId: 'ticket-1',
        transferId: 'transfer-1',
      },
    );

    const records = tx.ticketRealtimeOutbox.createMany.mock.calls[0][0].data;
    expect(records).toEqual([
      expect.objectContaining({ scopeType: TicketRealtimeScopeType.USER, recipientUserId: 'user-a' }),
      expect.objectContaining({ scopeType: TicketRealtimeScopeType.USER, recipientUserId: 'user-b' }),
      expect.objectContaining({ scopeType: TicketRealtimeScopeType.ADMIN_EVENT, recipientUserId: null }),
    ]);
    expect(records).toHaveLength(3);
    expect(JSON.stringify(records)).not.toContain('identityDocument');
    expect(JSON.stringify(records)).not.toContain('recipientPersonId');
    expect(records[2]).toEqual(expect.objectContaining({ recipientUserId: null }));
  });

  it('derives replay scopes from a private channel and user or event identity', () => {
    const scopes: unknown[][] = [];
    const invalidations = { scope: jest.fn((...parts: unknown[]) => { scopes.push(parts); return 'opaque-scope'; }) };
    const service = new TicketRealtimeService({} as never, invalidations as never);

    expect(service.scope('user-a')).toBe('opaque-scope');
    expect(service.adminEventScope('event-1')).toBe('opaque-scope');
    expect(scopes).toEqual([
      ['current-user-tickets', 'user-a'],
      ['admin-event-tickets', 'event-1'],
    ]);
  });
});
