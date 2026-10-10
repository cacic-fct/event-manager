-- CreateEnum
CREATE TYPE "EventTicketIssueSource" AS ENUM ('EVENT_SUBSCRIPTION', 'MAJOR_EVENT_SUBSCRIPTION', 'ADMIN', 'PURCHASE');

-- CreateEnum
CREATE TYPE "EventTicketStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TicketSubscriptionRequirement" AS ENUM ('ANY', 'REQUIRED', 'NONE');

-- CreateEnum
CREATE TYPE "TicketExpirationMode" AS ENUM ('EVENT_END', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TicketTransferSenderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketTransferRecipientStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IGNORED', 'SYSTEM_INELIGIBLE', 'SYSTEM_DUPLICATE');

-- CreateEnum
CREATE TYPE "TicketTransferIgnoreReason" AS ENUM ('USER_IGNORED', 'INELIGIBLE', 'ALREADY_HELD');

-- CreateEnum
CREATE TYPE "TicketTransferInitiatorType" AS ENUM ('HOLDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketPurchaseStatus" AS ENUM ('UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketHistoryOperation" AS ENUM ('ISSUED', 'TRANSFER_REQUESTED', 'TRANSFER_ACCEPTED', 'TRANSFER_IGNORED', 'TRANSFER_CANCELED', 'TRANSFERRED', 'CONSUMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TicketNotificationType" AS ENUM ('SENDER_STARTED', 'SENDER_ADMIN_STARTED', 'SENDER_CANCELED', 'SENDER_ADMIN_CANCELED', 'RECIPIENT_REQUESTED', 'RECIPIENT_INELIGIBLE', 'SENDER_ACCEPTED');

-- CreateEnum
CREATE TYPE "TicketRealtimeInvalidationType" AS ENUM ('TICKETS_CHANGED', 'TRANSFERS_CHANGED', 'PURCHASES_CHANGED');

-- CreateEnum
CREATE TYPE "TicketRealtimeScopeType" AS ENUM ('USER', 'ADMIN_EVENT');

-- CreateEnum
CREATE TYPE "TicketEntitlementReconciliationPhase" AS ENUM ('EVENT_SUBSCRIPTIONS', 'MAJOR_EVENT_SUBSCRIPTIONS', 'COMPLETE');

-- AlterEnum
ALTER TYPE "AttendanceCurrentAssessment" ADD VALUE 'TICKET_REQUIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogEntityType" ADD VALUE 'TICKET';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'TICKET_CONFIG';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'TICKET_TRANSFER';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'TICKET_PURCHASE';

-- CreateTable
CREATE TABLE "ticket_configs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "displayEmoji" TEXT,
    "description" TEXT,
    "transferEligibilityDescription" TEXT,
    "transferable" BOOLEAN NOT NULL DEFAULT false,
    "issueOnEventSubscription" BOOLEAN NOT NULL DEFAULT false,
    "issueOnMajorEventSubscription" BOOLEAN NOT NULL DEFAULT false,
    "includedPriceTierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientSubscriptionRequirement" "TicketSubscriptionRequirement" NOT NULL DEFAULT 'ANY',
    "recipientRequiresUnesp" BOOLEAN NOT NULL DEFAULT false,
    "recipientAcademicIdPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientCourseCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientRequiresAccountManagerVerification" BOOLEAN NOT NULL DEFAULT false,
    "recipientAllowedPriceTierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchaseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "purchaseRequiresUnesp" BOOLEAN NOT NULL DEFAULT false,
    "purchaseAcademicIdPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchaseCourseCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchaseRequiresAccountManagerVerification" BOOLEAN NOT NULL DEFAULT false,
    "purchaseVisiblePriceTierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expirationMode" "TicketExpirationMode" NOT NULL DEFAULT 'EVENT_END',
    "customExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_price_options" (
    "id" TEXT NOT NULL,
    "ticketConfigId" TEXT NOT NULL,
    "priceTierId" TEXT,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_price_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketConfigId" TEXT NOT NULL,
    "holderPersonId" TEXT,
    "originalHolderPersonId" TEXT,
    "source" "EventTicketIssueSource" NOT NULL,
    "sourceKey" TEXT,
    "status" "EventTicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByPersonId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_ticket_history" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "operation" "TicketHistoryOperation" NOT NULL,
    "previousHolderPersonId" TEXT,
    "newHolderPersonId" TEXT,
    "transferId" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_ticket_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transfers" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "senderPersonId" TEXT,
    "senderUserId" TEXT,
    "recipientPersonId" TEXT,
    "recipientUserId" TEXT,
    "authorUserId" TEXT,
    "initiatorType" "TicketTransferInitiatorType" NOT NULL DEFAULT 'HOLDER',
    "initiatingAdminUserId" TEXT,
    "submittedDestinationIdentityDocumentEncrypted" TEXT,
    "senderStatus" "TicketTransferSenderStatus" NOT NULL DEFAULT 'PENDING',
    "recipientStatus" "TicketTransferRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "ignoreReason" "TicketTransferIgnoreReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),

    CONSTRAINT "ticket_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transfer_resolution_outbox" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_transfer_resolution_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transfer_author_cooldowns" (
    "userId" TEXT NOT NULL,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "lastSubmittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_transfer_author_cooldowns_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ticket_purchases" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,
    "ticketConfigId" TEXT NOT NULL,
    "majorEventSubscriptionId" TEXT,
    "personId" TEXT,
    "priceOptionId" TEXT,
    "priceTierId" TEXT,
    "priceTierName" TEXT,
    "ticketName" TEXT NOT NULL,
    "ticketEmoji" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "TicketPurchaseStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "receiptUploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptExpiresAt" TIMESTAMP(3) NOT NULL,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "lgpdDeletionRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_notification_outbox" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "notificationType" "TicketNotificationType" NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "ticketName" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "actorFirstName" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_realtime_outbox" (
    "id" TEXT NOT NULL,
    "scopeType" "TicketRealtimeScopeType" NOT NULL DEFAULT 'USER',
    "recipientUserId" TEXT,
    "type" "TicketRealtimeInvalidationType" NOT NULL,
    "eventId" TEXT,
    "ticketId" TEXT,
    "transferId" TEXT,
    "purchaseId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_realtime_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_entitlement_reconciliation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "phase" "TicketEntitlementReconciliationPhase" NOT NULL DEFAULT 'EVENT_SUBSCRIPTIONS',
    "cursor" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_entitlement_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_configs_eventId_key" ON "ticket_configs"("eventId");

-- CreateIndex
CREATE INDEX "ticket_price_options_priceTierId_idx" ON "ticket_price_options"("priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_price_options_config_tier_key" ON "ticket_price_options"("ticketConfigId", "priceTierId") WHERE ("priceTierId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_price_options_config_fixed_key" ON "ticket_price_options"("ticketConfigId") WHERE ("priceTierId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_source_key_key" ON "event_tickets"("sourceKey");

-- CreateIndex
CREATE INDEX "event_tickets_eventId_status_expiresAt_idx" ON "event_tickets"("eventId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "event_tickets_holderPersonId_status_expiresAt_idx" ON "event_tickets"("holderPersonId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "event_tickets_ticketConfigId_idx" ON "event_tickets"("ticketConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_current_holder_key" ON "event_tickets"("eventId", "holderPersonId") WHERE ("status" IN ('ACTIVE', 'CONSUMED'));

-- CreateIndex
CREATE INDEX "event_ticket_history_ticketId_createdAt_idx" ON "event_ticket_history"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "event_ticket_history_transferId_idx" ON "event_ticket_history"("transferId");

-- CreateIndex
CREATE INDEX "ticket_transfers_authorUserId_senderStatus_createdAt_idx" ON "ticket_transfers"("authorUserId", "senderStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_transfers_recipientUserId_recipientStatus_createdAt_idx" ON "ticket_transfers"("recipientUserId", "recipientStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_transfers_senderPersonId_createdAt_idx" ON "ticket_transfers"("senderPersonId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_transfers_eventId_createdAt_idx" ON "ticket_transfers"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_transfers_one_pending_per_ticket" ON "ticket_transfers"("ticketId") WHERE ("senderStatus" = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "ticket_transfer_resolution_outbox_transferId_key" ON "ticket_transfer_resolution_outbox"("transferId");

-- CreateIndex
CREATE INDEX "ticket_transfer_resolution_outbox_completedAt_nextAttemptAt_idx" ON "ticket_transfer_resolution_outbox"("completedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ticket_purchases_majorEventId_status_createdAt_idx" ON "ticket_purchases"("majorEventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_purchases_eventId_personId_createdAt_idx" ON "ticket_purchases"("eventId", "personId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_purchases_majorEventSubscriptionId_idx" ON "ticket_purchases"("majorEventSubscriptionId");

-- CreateIndex
CREATE INDEX "ticket_purchases_receiptExpiresAt_idx" ON "ticket_purchases"("receiptExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_purchases_config_person_active_key" ON "ticket_purchases"("ticketConfigId", "personId") WHERE ("status" IN ('UNDER_REVIEW', 'APPROVED'));

-- CreateIndex
CREATE INDEX "ticket_notification_outbox_sentAt_nextAttemptAt_idx" ON "ticket_notification_outbox"("sentAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_notification_outbox_transfer_type_key" ON "ticket_notification_outbox"("transferId", "notificationType");

-- CreateIndex
CREATE INDEX "ticket_realtime_outbox_publishedAt_nextAttemptAt_idx" ON "ticket_realtime_outbox"("publishedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ticket_realtime_outbox_recipientUserId_createdAt_idx" ON "ticket_realtime_outbox"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_entitlement_reconciliation_eventId_createdAt_idx" ON "ticket_entitlement_reconciliation"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_entitlement_reconciliation_completedAt_nextAttemptAt_idx" ON "ticket_entitlement_reconciliation"("completedAt", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "ticket_configs" ADD CONSTRAINT "ticket_configs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_price_options" ADD CONSTRAINT "ticket_price_options_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "ticket_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_price_options" ADD CONSTRAINT "ticket_price_options_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "price_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "ticket_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_holderPersonId_fkey" FOREIGN KEY ("holderPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_originalHolderPersonId_fkey" FOREIGN KEY ("originalHolderPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ticket_history" ADD CONSTRAINT "event_ticket_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ticket_history" ADD CONSTRAINT "event_ticket_history_previousHolderPersonId_fkey" FOREIGN KEY ("previousHolderPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ticket_history" ADD CONSTRAINT "event_ticket_history_newHolderPersonId_fkey" FOREIGN KEY ("newHolderPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ticket_history" ADD CONSTRAINT "event_ticket_history_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "ticket_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_senderPersonId_fkey" FOREIGN KEY ("senderPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_initiatingAdminUserId_fkey" FOREIGN KEY ("initiatingAdminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfer_resolution_outbox" ADD CONSTRAINT "ticket_transfer_resolution_outbox_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "ticket_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfer_author_cooldowns" ADD CONSTRAINT "ticket_transfer_author_cooldowns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_ticketConfigId_fkey" FOREIGN KEY ("ticketConfigId") REFERENCES "ticket_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_majorEventSubscriptionId_fkey" FOREIGN KEY ("majorEventSubscriptionId") REFERENCES "major_event_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_priceOptionId_fkey" FOREIGN KEY ("priceOptionId") REFERENCES "ticket_price_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchases" ADD CONSTRAINT "ticket_purchases_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "price_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
