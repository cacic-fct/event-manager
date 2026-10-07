import { BadRequestException, ConflictException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma, TicketPurchase } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { randomUUID } from 'node:crypto';
import { addYears } from 'date-fns';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { CurrentUserContextService } from '../current-user/context.service';
import type { GraphqlContext } from '../current-user/selects';
import { AdminReceiptQueueItem, CurrentUserReceiptResponse, UploadedReceiptFile } from '../major-event-receipts/receipt.types';
import { assertValidReceiptUpload, isPdfReceiptMimeType } from '../major-event-receipts/utils/receipt-file.utils';
import { createReceiptSharp, assertReceiptBufferWithinProcessingLimits, isReceiptImageProcessingError } from '../major-event-receipts/utils/receipt-image-processing.utils';
import { processReceiptPdf, ReceiptPdfProcessingError } from '../major-event-receipts/utils/receipt-pdf-processing.utils';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { TicketEligibilityService } from '../tickets/ticket-eligibility.service';
import { TicketRealtimeService } from '../tickets/ticket-realtime.service';
import { hasValidatedSubscriptionReceipt, TicketPurchaseCatalogService } from './ticket-purchase-catalog.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { TicketPurchaseModel } from './ticket-purchase.models';

const purchaseInclude = {
  ticketConfig: true,
  event: true,
  majorEvent: true,
  person: true,
} satisfies Prisma.TicketPurchaseInclude;

@Injectable()
export class TicketPurchasesService {
  private readonly logger = new Logger(TicketPurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly catalog: TicketPurchaseCatalogService,
    private readonly s3: S3Service,
    private readonly authorization: AuthorizationPolicyService,
    private readonly audit: AuditLogService,
    private readonly issuance: TicketIssuanceService,
    private readonly eligibility: TicketEligibilityService,
    private readonly realtime: TicketRealtimeService,
    private readonly frozenResources: FrozenResourceService,
  ) {}

  private async person(user: AuthenticatedUser) {
    return this.currentUser.requireCurrentPerson({ req: { user } } as GraphqlContext);
  }

  async options(majorEventId: string, user: AuthenticatedUser) {
    const person = await this.person(user);
    return this.catalog.listOffers(this.prisma, person.id, majorEventId);
  }

  async mine(majorEventId: string, user: AuthenticatedUser): Promise<TicketPurchaseModel[]> {
    const person = await this.person(user);
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const purchases = await this.prisma.ticketPurchase.findMany({
        where: { personId: person.id, majorEventId }, include: purchaseInclude, orderBy: { createdAt: 'desc' },
      });
      return purchases.map((purchase) => ({
        id: purchase.id, eventId: purchase.eventId, majorEventId: purchase.majorEventId,
        ticketConfigId: purchase.ticketConfigId,
        name: purchase.ticketName,
        emoji: purchase.ticketEmoji,
        amountCents: purchase.amountCents, status: purchase.status,
        priceTierName: purchase.priceTierName, rejectionReason: purchase.rejectionReason,
        createdAt: purchase.createdAt, updatedAt: purchase.updatedAt, receipt: this.receipt(purchase),
      }));
    });
  }

  async upload(eventId: string, file: UploadedReceiptFile | undefined, expected: { ticketConfigId: string; amountCents: number }, user: AuthenticatedUser) {
    assertValidReceiptUpload(file);
    if (!expected.ticketConfigId || !Number.isSafeInteger(expected.amountCents) || expected.amountCents <= 0) {
      throw new BadRequestException('Confira o valor do bilhete antes de enviar o comprovante.');
    }
    const person = await this.person(user);
    const identity = await this.eligibility.prepareIdentitySnapshot(eventId, person.id, 'purchase');
    const offer = await this.catalog.requireOffer(this.prisma, person.id, eventId, identity);
    if (offer.ticketConfigId !== expected.ticketConfigId || offer.amountCents !== expected.amountCents) {
      throw new ConflictException('O valor do bilhete mudou. Confira as informações de pagamento novamente.');
    }
    const buffer = await this.prepareReceipt(file);
    const receiptExpiresAt = addYears(new Date(), 1);
    const objectKey = `ticket-purchases/${offer.majorEventId}/${person.id}/${randomUUID()}.png`;
    const uploaded = await this.s3.uploadFile(objectKey, buffer, 'image/png', { eventId, personId: person.id }, receiptExpiresAt);
    let purchase: TicketPurchase;
    try {
      purchase = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
        await this.lockSubscription(tx, offer.majorEventSubscriptionId);
        // Serialize reservations for the same ticket configuration before checking stock.
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ticket_configs" WHERE "id" = ${offer.ticketConfigId} FOR UPDATE`);
        const current = await this.catalog.requireOffer(tx, person.id, eventId, identity);
        if (current.amountCents !== offer.amountCents || current.priceTierId !== offer.priceTierId ||
          current.ticketConfigId !== offer.ticketConfigId || current.majorEventSubscriptionId !== offer.majorEventSubscriptionId) {
          throw new ConflictException('As condições de compra mudaram. Atualize a página antes de enviar.');
        }
        const created = await tx.ticketPurchase.create({
          data: {
            eventId, majorEventId: current.majorEventId, ticketConfigId: current.ticketConfigId,
            majorEventSubscriptionId: current.majorEventSubscriptionId, personId: person.id,
            priceOptionId: current.priceOptionId, priceTierId: current.priceTierId,
            priceTierName: current.priceTierName, amountCents: current.amountCents,
            ticketName: current.name, ticketEmoji: current.emoji,
            status: 'UNDER_REVIEW', objectKey: uploaded.key, fileName: file.originalname || 'comprovante',
            mimeType: 'image/png', sizeBytes: uploaded.size, receiptUploadedAt: new Date(), receiptExpiresAt,
          },
        });
        await this.record(tx, created, user, AuditLogOperation.SUBMIT, 'Comprovante de compra de bilhete enviado.', { status: created.status, amountCents: created.amountCents });
        return created;
      });
    } catch (error: unknown) {
      await this.s3.deleteFile(uploaded.key).catch(() => this.logger.error('Could not remove an uncommitted ticket purchase receipt.'));
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma compra deste bilhete em análise ou aprovada.');
      }
      throw error;
    }
    return { ...this.receipt(purchase), purchaseId: purchase.id };
  }

  async approve(purchaseId: string, user: AuthenticatedUser): Promise<boolean> {
    const target = await this.requirePurchase(purchaseId);
    await this.authorization.assertPermissions(user, [Permission.Receipt.Approve], { majorEventId: target.majorEventId });
    await this.frozenResources.assertMajorEventMutable(target.majorEventId, user, 'edit');
    if (!target.personId) throw new ConflictException('A pessoa desta compra não está mais disponível.');
    const identity = await this.eligibility.prepareIdentitySnapshot(target.eventId, target.personId, 'purchase');
    return runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const purchase = await tx.ticketPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: purchaseInclude });
      if (purchase.status !== 'UNDER_REVIEW') throw new ConflictException('Esta compra já foi analisada.');
      if (!purchase.majorEventSubscriptionId || !purchase.personId) throw new ConflictException('A inscrição desta compra não está mais disponível.');
      await this.lockSubscription(tx, purchase.majorEventSubscriptionId);
      const subscription = await tx.majorEventSubscription.findUnique({ where: { id: purchase.majorEventSubscriptionId } });
      if (!hasValidatedSubscriptionReceipt(subscription) || !subscription ||
        subscription.personId !== purchase.personId || subscription.majorEventId !== purchase.majorEventId ||
        subscription.paymentTier?.trim().toLocaleLowerCase('pt-BR') !== purchase.priceTierName?.trim().toLocaleLowerCase('pt-BR')) {
        throw new ConflictException('A inscrição ou modalidade mudou. Revise a compra antes de aprovar.');
      }
      const expiresAt = purchase.ticketConfig.expirationMode === 'CUSTOM' ? purchase.ticketConfig.customExpiresAt : purchase.event.endDate;
      if (!purchase.ticketConfig.enabled || !expiresAt || expiresAt <= new Date() || purchase.event.deletedAt || purchase.majorEvent.deletedAt) {
        throw new ConflictException('Este bilhete não pode mais ser emitido.');
      }
      const eligible = await this.eligibility.evaluatePurchaseEligibility(tx, purchase.eventId, purchase.personId, identity);
      if (!eligible.eligible) throw new ConflictException('O participante não atende mais aos critérios de compra.');
      const duplicate = await tx.eventTicket.findFirst({
        where: { eventId: purchase.eventId, holderPersonId: purchase.personId, status: { in: ['ACTIVE', 'CONSUMED'] } }, select: { id: true },
      });
      if (duplicate) throw new ConflictException('O participante já possui este bilhete.');
      const changed = await tx.ticketPurchase.updateMany({
        where: { id: purchaseId, status: 'UNDER_REVIEW' },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: user.sub, rejectionReason: null },
      });
      if (changed.count !== 1) throw new ConflictException('Esta compra já foi analisada.');
      await this.issuance.issueForPerson(tx, purchase.eventId, purchase.personId, 'PURCHASE', purchase.id);
      await this.record(tx, purchase, user, AuditLogOperation.APPROVE, 'Compra de bilhete aprovada.', { status: 'APPROVED' });
      return true;
    });
  }

  async reject(purchaseId: string, reason: string, user: AuthenticatedUser): Promise<boolean> {
    const normalized = reason.trim();
    if (!normalized || normalized.length > 1000) throw new BadRequestException('Informe um motivo de até 1.000 caracteres.');
    const purchase = await this.requirePurchase(purchaseId);
    await this.authorization.assertPermissions(user, [Permission.Receipt.Reject], { majorEventId: purchase.majorEventId });
    await this.frozenResources.assertMajorEventMutable(purchase.majorEventId, user, 'edit');
    return runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const changed = await tx.ticketPurchase.updateMany({
        where: { id: purchaseId, status: 'UNDER_REVIEW' },
        data: { status: 'REJECTED', rejectionReason: normalized, reviewedAt: new Date(), reviewedById: user.sub },
      });
      if (changed.count !== 1) throw new ConflictException('Esta compra já foi analisada.');
      await this.record(tx, purchase, user, AuditLogOperation.REJECT, 'Compra de bilhete recusada.', { status: 'REJECTED', rejectionReason: normalized });
      return true;
    });
  }

  async image(purchaseId: string, user: AuthenticatedUser) {
    const purchase = await this.requirePurchase(purchaseId);
    const person = await this.currentUser.resolveCurrentUserContext(user);
    if (person.person?.id !== purchase.personId) {
      await this.authorization.assertPermissions(user, [Permission.Receipt.Read], { majorEventId: purchase.majorEventId });
    }
    if (purchase.receiptExpiresAt <= new Date()) throw new GoneException('O comprovante expirou.');
    return this.s3.downloadFile(purchase.objectKey);
  }

  async pending(majorEventId?: string): Promise<AdminReceiptQueueItem[]> {
    const purchases = await this.prisma.ticketPurchase.findMany({
      where: { status: 'UNDER_REVIEW', ...(majorEventId ? { majorEventId } : {}), majorEvent: { deletedAt: null }, person: { is: { deletedAt: null } } },
      include: purchaseInclude, orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return purchases.flatMap((purchase): AdminReceiptQueueItem[] => {
      const person = purchase.person;
      const personId = purchase.personId;
      if (!person || !personId) return [];
      return [{
      category: 'TICKET', purchaseId: purchase.id, ticketName: purchase.ticketName,
      subscriptionId: purchase.id, subscriptionCreatedAt: purchase.createdAt,
      majorEventId: purchase.majorEventId, majorEventName: purchase.majorEvent.name,
      majorEventCreatedAt: purchase.majorEvent.createdAt, majorEventEndDate: purchase.majorEvent.endDate,
      personId, personName: person.name, personEmail: person.email, personPhone: person.phone,
      amountPaid: purchase.amountCents, paymentTier: purchase.priceTierName, subscriptionFlow: 'REGULAR',
      subscriptionStatus: 'RECEIPT_UNDER_REVIEW', subscriptionUpdatedAt: purchase.updatedAt,
      receiptRejectionReason: purchase.rejectionReason, receipt: this.receipt(purchase),
      events: [{
        id: purchase.event.id, name: purchase.event.name, emoji: purchase.ticketEmoji,
        type: purchase.event.type, startDate: purchase.event.startDate, endDate: purchase.event.endDate,
        locationDescription: purchase.event.locationDescription, autoSubscribe: false,
        selectedForConfirmation: false, hasScheduleConflict: false, hasNoSlots: false,
      }],
      }];
    });
  }

  private async lockSubscription(tx: Prisma.TransactionClient, subscriptionId: string): Promise<void> {
    // Receipt review must not race a concurrent subscription cancellation or edit.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "major_event_subscriptions" WHERE "id" = ${subscriptionId} FOR UPDATE`);
  }

  private receipt(purchase: TicketPurchase): CurrentUserReceiptResponse {
    return {
      id: purchase.id, fileName: purchase.fileName, mimeType: purchase.mimeType, sizeBytes: purchase.sizeBytes,
      uploadedAt: purchase.receiptUploadedAt, expiresAt: purchase.receiptExpiresAt,
      imageUrl: `/api/ticket-purchases/${purchase.id}/receipt`, processingStatus: 'CONVERTED',
    };
  }

  private async requirePurchase(id: string) {
    const purchase = await this.prisma.ticketPurchase.findUnique({ where: { id } });
    if (!purchase) throw new NotFoundException('Compra de bilhete não encontrada.');
    return purchase;
  }

  private async prepareReceipt(file: UploadedReceiptFile): Promise<Buffer> {
    try {
      if (isPdfReceiptMimeType(file.mimetype)) return (await processReceiptPdf(file.buffer)).previewBuffer;
      await assertReceiptBufferWithinProcessingLimits(file.buffer);
      return await createReceiptSharp(file.buffer).timeout({ seconds: 15 }).rotate().png().toBuffer();
    } catch (error) {
      if (error instanceof ReceiptPdfProcessingError || isReceiptImageProcessingError(error)) throw new BadRequestException(error.message);
      throw new BadRequestException('Não foi possível processar o comprovante. Envie outra imagem ou PDF.');
    }
  }

  private async record(tx: Prisma.TransactionClient, purchase: TicketPurchase, actor: AuthenticatedUser, operation: AuditLogOperation, summary: string, after: Prisma.InputJsonObject) {
    await this.audit.record({
      entityType: AuditLogEntityType.TICKET_PURCHASE, entityId: purchase.id, entityLabel: 'Compra de bilhete',
      operation, actor, summary, after, scope: { permission: Permission.Receipt.Read, eventId: purchase.eventId, majorEventId: purchase.majorEventId },
    }, tx);
    const person = purchase.personId ? await tx.people.findUnique({ where: { id: purchase.personId }, select: { userId: true } }) : null;
    if (person?.userId) await this.realtime.enqueueForUsers(tx, [person.userId], {
      type: 'PURCHASES_CHANGED', eventId: purchase.eventId, purchaseId: purchase.id,
    });
  }
}
