import { ConflictException } from '@nestjs/common';
import sharp from 'sharp';
import { TicketPurchasesService } from './ticket-purchases.service';

const user = { sub: 'account', token: 'token' } as never;
let png: Buffer;

function setup() {
  const now = new Date();
  const offer = {
    eventId: 'party', majorEventId: 'major', ticketConfigId: 'config', amountCents: 2500,
    priceTierId: 'tier', priceTierName: 'Básico', priceOptionId: 'price', majorEventSubscriptionId: 'subscription', name: 'Festa', emoji: '🎉',
  };
  const purchase = {
    id: 'purchase', ...offer, personId: 'person', status: 'UNDER_REVIEW',
    receiptUploadedAt: now, receiptExpiresAt: new Date(now.getTime() + 86_400_000),
    objectKey: 'stored-key', fileName: 'receipt.png', mimeType: 'image/png', sizeBytes: 100,
    ticketConfig: { enabled: true, expirationMode: 'EVENT_END' },
    event: { endDate: new Date(now.getTime() + 86_400_000), deletedAt: null }, majorEvent: { deletedAt: null },
  };
  const tx = {
    $queryRaw: jest.fn(),
    ticketPurchase: {
      create: jest.fn().mockResolvedValue(purchase),
      findUnique: jest.fn().mockResolvedValue(purchase),
      findUniqueOrThrow: jest.fn().mockResolvedValue(purchase),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    majorEventSubscription: { findUnique: jest.fn().mockResolvedValue({
      personId: 'person', majorEventId: 'major', subscriptionStatus: 'CONFIRMED', receiptValidatedAt: now, paymentTier: 'Básico',
    }) },
    eventTicket: { findFirst: jest.fn().mockResolvedValue(null) },
    people: { findUnique: jest.fn().mockResolvedValue({ userId: 'account' }) },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const currentUser = { requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person' }) };
  const catalog = { requireOffer: jest.fn().mockResolvedValue(offer) };
  const s3 = { uploadFile: jest.fn().mockResolvedValue({ key: 'stored-key', size: 100 }), deleteFile: jest.fn().mockResolvedValue(undefined) };
  const authorization = { assertPermissions: jest.fn() };
  const audit = { record: jest.fn() };
  const issuance = { issueForPerson: jest.fn() };
  const eligibility = { prepareIdentitySnapshot: jest.fn().mockResolvedValue({ personId: 'person', userId: 'account', accountManagerProfile: null }), evaluatePurchaseEligibility: jest.fn().mockResolvedValue({ eligible: true, reasons: [] }) };
  const realtime = { enqueueForUsers: jest.fn() };
  const frozenResources = { assertMajorEventMutable: jest.fn() };
  const service = new TicketPurchasesService(prisma as never, currentUser as never, catalog as never, s3 as never,
    authorization as never, audit as never, issuance as never, eligibility as never, realtime as never, frozenResources as never);
  return { frozenResources, service, tx, prisma, catalog, s3, authorization, audit, issuance, realtime, purchase };
}

function file() { return { buffer: png, originalname: 'receipt.png', mimetype: 'image/png', size: png.length }; }

beforeAll(async () => {
  png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
});

describe('ticket purchase transaction boundaries', () => {
  it.each(['approve', 'reject'] as const)('blocks frozen purchase %s before writing', async (operation) => {
    const { service, tx, frozenResources, issuance } = setup();
    frozenResources.assertMajorEventMutable.mockRejectedValue(new Error('Frozen'));
    const review = operation === 'approve' ? service.approve('purchase', user) : service.reject('purchase', 'Motivo', user);
    await expect(review).rejects.toThrow('Frozen');
    expect(frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major', user, 'edit');
    expect(tx.ticketPurchase.updateMany).not.toHaveBeenCalled();
    expect(issuance.issueForPerson).not.toHaveBeenCalled();
  });

  it('does not register a purchase or send invalidation when receipt storage fails', async () => {
    const { service, tx, s3, realtime } = setup();
    s3.uploadFile.mockRejectedValue(new Error('Storage unavailable'));
    await expect(service.upload('party', file(), { ticketConfigId: 'config', amountCents: 2500 }, user)).rejects.toThrow('Storage unavailable');
    expect(tx.ticketPurchase.create).not.toHaveBeenCalled();
    expect(realtime.enqueueForUsers).not.toHaveBeenCalled();
  });

  it('removes receipt and purchase if price or eligibility changes during upload', async () => {
    const { service, tx, catalog, s3 } = setup();
    catalog.requireOffer.mockResolvedValueOnce({ ...((await catalog.requireOffer()) as object) }).mockRejectedValueOnce(new ConflictException());
    await expect(service.upload('party', file(), { ticketConfigId: 'config', amountCents: 2500 }, user)).rejects.toThrow(ConflictException);
    expect(tx.ticketPurchase.create).not.toHaveBeenCalled();
    expect(s3.deleteFile).toHaveBeenCalledWith('stored-key');
  });

  it('commits authoritative price, audit, and SSE outbox atomically after upload', async () => {
    const { service, tx, s3, audit, realtime } = setup();
    const result = await service.upload('party', file(), { ticketConfigId: 'config', amountCents: 2500 }, user);
    expect(result.purchaseId).toBe('purchase');
    expect(s3.uploadFile.mock.invocationCallOrder[0]).toBeLessThan(tx.ticketPurchase.create.mock.invocationCallOrder[0]);
    expect(tx.ticketPurchase.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 2500, status: 'UNDER_REVIEW' }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'SUBMIT' }), tx);
    expect(realtime.enqueueForUsers).toHaveBeenCalledWith(tx, ['account'], { type: 'PURCHASES_CHANGED', eventId: 'party', purchaseId: 'purchase' });
  });

  it('prevents duplicate approval or issuance when another review wins', async () => {
    const { service, tx, issuance } = setup();
    tx.ticketPurchase.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve('purchase', user)).rejects.toThrow(ConflictException);
    expect(issuance.issueForPerson).not.toHaveBeenCalled();
  });

  it('requires current receipt validation again at approval', async () => {
    const { service, tx, issuance } = setup();
    tx.majorEventSubscription.findUnique.mockResolvedValue({ personId: 'person', majorEventId: 'major', subscriptionStatus: 'RECEIPT_UNDER_REVIEW', receiptValidatedAt: null, paymentTier: 'Básico' } as never);
    await expect(service.approve('purchase', user)).rejects.toThrow(ConflictException);
    expect(issuance.issueForPerson).not.toHaveBeenCalled();
    expect(tx.ticketPurchase.updateMany).not.toHaveBeenCalled();
  });

  it('avoids duplicate entitlement if a transfer completes during purchase review', async () => {
    const { service, tx, issuance } = setup();
    tx.eventTicket.findFirst.mockResolvedValue({ id: 'transferred-ticket' } as never);
    await expect(service.approve('purchase', user)).rejects.toThrow(ConflictException);
    expect(issuance.issueForPerson).not.toHaveBeenCalled();
  });

  it('checks the purchase major-event permission before changing a review', async () => {
    const { service, authorization, tx } = setup();
    authorization.assertPermissions.mockRejectedValue(new Error('Forbidden'));
    await expect(service.reject('purchase', 'Comprovante inválido', user)).rejects.toThrow('Forbidden');
    expect(authorization.assertPermissions).toHaveBeenCalledWith(user, expect.any(Array), { majorEventId: 'major' });
    expect(tx.ticketPurchase.updateMany).not.toHaveBeenCalled();
  });
});
