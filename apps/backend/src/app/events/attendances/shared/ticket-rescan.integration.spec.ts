import { AttendanceCategory, AttendanceCreationMethod, EventAttendanceStatus, EventTicketStatus } from '@prisma/client';
import { AttendanceCategoryService } from '../../attendance-category.service';
import { TicketIssuanceService } from '../../../tickets/ticket-issuance.service';
import { createOrRestoreEventAttendance } from './event-attendance-writer';

/** Exercises the writer and category service against the actual ticket redemption policy. */
describe('non-regular attendance ticket rescan', () => {
  it.each(['issued', 'transferred'] as const)('redeems a ticket %s after the first scan while retaining collection provenance', async (acquisition) => {
    const scanTime = new Date(Date.now() - 1_000);
    const originalTime = new Date(scanTime.getTime() - 60_000);
    const acquiredAt = new Date(scanTime.getTime() - 30_000);
    const event = {
      id: 'event', name: 'Evento', deletedAt: null, majorEventId: null, eventGroup: null,
      majorEvent: null, endDate: new Date(scanTime.getTime() + 60_000), allowSubscription: false,
      ticketConfig: { id: 'config', enabled: true, displayName: null, expirationMode: 'EVENT_END',
        issueOnEventSubscription: false, issueOnMajorEventSubscription: false,
        createdAt: new Date(originalTime.getTime() - 60_000), updatedAt: new Date(originalTime.getTime() - 60_000) },
    };
    const attendance = {
      personId: 'person', eventId: 'event', status: EventAttendanceStatus.PRESENT,
      category: AttendanceCategory.NON_REGULAR, attendedAt: originalTime,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      createdById: 'original-collector', committedById: 'original-uploader', event,
    };
    const ticket = {
      id: 'ticket', eventId: 'event', holderPersonId: 'person', status: EventTicketStatus.ACTIVE,
      issuedAt: acquisition === 'issued' ? acquiredAt : new Date(originalTime.getTime() - 1_000),
      acceptedAt: acquisition === 'transferred' ? acquiredAt : null,
      expiresAt: event.endDate, event, holder: { userId: 'holder' },
    };
    const tx = {
      $queryRaw: jest.fn(), $executeRaw: jest.fn(),
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      eventAttendance: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...attendance })),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({ ...attendance })),
        update: jest.fn().mockImplementation(async ({ data }: { data: Partial<typeof attendance> }) => Object.assign(attendance, data)),
        create: jest.fn(),
      },
      eventTicket: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { status: EventTicketStatus } }) =>
          ticket.status === where.status ? { id: ticket.id } : null,
        ),
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { status: EventTicketStatus; issuedAt?: { lte: Date } } }) => {
          if (ticket.status !== where.status) return [];
          if (where.issuedAt && ticket.issuedAt > where.issuedAt.lte) return [];
          return [{ ...ticket, transfers: [] }];
        }),
        updateMany: jest.fn().mockImplementation(async ({ data }: { data: { status: EventTicketStatus } }) => {
          Object.assign(ticket, data);
          return { count: 1 };
        }),
      },
      eventTicketHistory: { create: jest.fn() },
      ticketTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Coletor', email: null }) },
      auditLogEntry: { create: jest.fn() },
    };
    const tickets = new TicketIssuanceService({} as never, { enqueueForUsers: jest.fn() } as never);
    const categories = new AttendanceCategoryService({} as never, undefined, tickets);
    const result = await createOrRestoreEventAttendance({
      tx: tx as never, attendanceCategories: categories, refreshNonRegular: true,
      input: { eventId: 'event', personId: 'person', createdByMethod: AttendanceCreationMethod.SCANNER,
        attendedAt: scanTime, createdById: 'new-collector', committedById: 'new-uploader' },
    });

    expect(ticket.status).toBe(EventTicketStatus.CONSUMED);
    expect(tx.eventTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ consumedAt: scanTime }) }));
    expect(result).toEqual(expect.objectContaining({
      category: AttendanceCategory.REGULAR, attendedAt: originalTime,
      createdById: 'original-collector', committedById: 'original-uploader', createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
    }));
    expect(tx.eventTicketHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'new-uploader' }) }));
    expect(tx.eventAttendance.create).not.toHaveBeenCalled();
  });
});
