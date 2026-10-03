import { AttendanceCategoryService } from './attendance-category.service';

function scenario(input: { consumed?: boolean; status?: 'PRESENT' | 'ABSENT' } = {}) {
  let consumed = input.consumed ?? false;
  const attendedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  const tx = {
    eventAttendance: {
      findUnique: jest.fn().mockResolvedValue({
        personId: 'holder', status: input.status ?? 'PRESENT', attendedAt, committedById: 'uploader', createdById: 'collector',
        event: { id: 'party', ticketConfig: { enabled: true }, allowSubscription: false, majorEventId: null, majorEvent: null },
      }),
      update: jest.fn(),
    },
    eventTicket: { findFirst: jest.fn().mockImplementation(async () => consumed ? { id: 'ticket' } : null) },
    eventSubscription: { findFirst: jest.fn() },
  };
  const tickets = {
    syncForAttendance: jest.fn(),
    consumeForAttendance: jest.fn().mockImplementation(async () => { consumed = true; }),
  };
  const service = new AttendanceCategoryService(tx as never, undefined, tickets as never);
  return { service, tx, tickets, attendedAt };
}

describe('attendance ticket entitlement', () => {
  it('classifies attendance from ticket ownership alone in the supplied transaction', async () => {
    const { service, tx, tickets, attendedAt } = scenario();
    await service.refreshForAttendance('holder', 'party', tx as never, true);
    expect(tickets.syncForAttendance).toHaveBeenCalledWith(tx, 'party', 'holder', attendedAt);
    expect(tickets.consumeForAttendance).toHaveBeenCalledWith(tx, 'party', 'holder', { actorUserId: 'uploader', attendedAt });
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      category: 'REGULAR', currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
    } }));
    expect(tx.eventSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('retains the attendance as non-regular when no owned ticket can be consumed', async () => {
    const { service, tx, tickets } = scenario();
    tickets.consumeForAttendance.mockImplementation(async () => undefined);
    await service.refreshForAttendance('holder', 'party', tx as never, true);
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      category: 'NON_REGULAR', currentAssessment: 'TICKET_REQUIRED',
    } }));
  });

  it('does not consume a new ticket when subscription edits refresh old attendance', async () => {
    const { service, tx, tickets } = scenario();
    await service.refreshForAttendance('holder', 'party', tx as never);
    expect(tickets.consumeForAttendance).not.toHaveBeenCalled();
    expect(tickets.syncForAttendance).not.toHaveBeenCalled();
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      category: 'NON_REGULAR', currentAssessment: 'TICKET_REQUIRED',
    } }));
  });

  it('does not redeem a ticket when oral attendance marks someone absent', async () => {
    const { service, tx, tickets } = scenario({ status: 'ABSENT' });
    await service.refreshForAttendance('holder', 'party', tx as never, true);
    expect(tickets.consumeForAttendance).not.toHaveBeenCalled();
  });

  it('preserves consumed proof on refresh despite expiry or registration changes', async () => {
    const { service, tx, tickets } = scenario({ consumed: true });
    await service.refreshForAttendance('holder', 'party', tx as never);
    expect(tickets.consumeForAttendance).not.toHaveBeenCalled();
    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith({ where: { eventId: 'party', holderPersonId: 'holder', status: 'CONSUMED' }, select: { id: true } });
    expect(tx.eventAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      category: 'REGULAR', currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
    } }));
  });
});
