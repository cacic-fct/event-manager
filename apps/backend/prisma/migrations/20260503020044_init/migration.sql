-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'EVENT_MANAGER', 'CACIC', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MINICURSO', 'PALESTRA', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('SINGLE', 'TIERED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('WAITING_RECEIPT_UPLOAD', 'RECEIPT_UNDER_REVIEW', 'REJECTED_INVALID_RECEIPT', 'REJECTED_NO_SLOTS', 'REJECTED_SCHEDULE_CONFLICT', 'REJECTED_GENERIC', 'CONFIRMED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AttendanceCreationMethod" AS ENUM ('CSV_IMPORT', 'MANUAL_INPUT', 'SCANNER', 'ONLINE_CODE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MergeCandidateStatus" AS ENUM ('PENDING', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MergeMatchMethod" AS ENUM ('CPF', 'EMAIL', 'NORMALIZED_NAME');

-- CreateEnum
CREATE TYPE "PeopleMergeOperationStatus" AS ENUM ('APPLIED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "CertificateScope" AS ENUM ('MAJOR_EVENT', 'EVENT_GROUP', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificateIssuedTo" AS ENUM ('ATTENDEE', 'LECTURER', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identityDocument" TEXT,
    "academicId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "major_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '❔',
    "subscriptionStartDate" TIMESTAMP(3),
    "subscriptionEndDate" TIMESTAMP(3),
    "maxCoursesPerAttendee" INTEGER,
    "maxLecturesPerAttendee" INTEGER,
    "buttonText" TEXT,
    "buttonLink" TEXT,
    "contactInfo" TEXT,
    "contactType" "ContactType",
    "isPaymentRequired" BOOLEAN NOT NULL DEFAULT false,
    "additionalPaymentInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "major_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_info" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,

    CONSTRAINT "payment_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '❔',
    "shouldIssueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "shouldIssueCertificateForEachEvent" BOOLEAN NOT NULL DEFAULT false,
    "shouldIssuePartialCertificate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditMinutes" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'OTHER',
    "emoji" TEXT NOT NULL DEFAULT '❔',
    "description" TEXT,
    "shortDescription" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationDescription" TEXT,
    "majorEventId" TEXT,
    "eventGroupId" TEXT,
    "allowSubscription" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionStartDate" TIMESTAMP(3),
    "subscriptionEndDate" TIMESTAMP(3),
    "slots" INTEGER,
    "autoSubscribe" BOOLEAN NOT NULL DEFAULT false,
    "shouldIssueCertificate" BOOLEAN NOT NULL DEFAULT false,
    "shouldCollectAttendance" BOOLEAN NOT NULL DEFAULT false,
    "isOnlineAttendanceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "onlineAttendanceCode" TEXT,
    "onlineAttendanceStartDate" TIMESTAMP(3),
    "onlineAttendanceEndDate" TIMESTAMP(3),
    "publiclyVisible" BOOLEAN NOT NULL DEFAULT true,
    "youtubeCode" TEXT,
    "buttonText" TEXT,
    "buttonLink" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_subscriptions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventGroupSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_group_subscriptions" (
    "id" TEXT NOT NULL,
    "eventGroupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_group_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "major_event_subscriptions" (
    "id" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "amountPaid" INTEGER,
    "paymentDate" TIMESTAMP(3),
    "paymentTier" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'WAITING_RECEIPT_UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "major_event_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "major_event_prices" (
    "id" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,
    "type" "PriceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "major_event_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_tiers" (
    "id" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "secondaryEmails" TEXT[],
    "phone" TEXT,
    "identityDocument" TEXT,
    "isCPF" BOOLEAN DEFAULT true,
    "academicId" TEXT,
    "userId" TEXT,
    "mergedIntoId" TEXT,
    "externalRef" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendances" (
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByMethod" "AttendanceCreationMethod" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "event_attendances_pkey" PRIMARY KEY ("personId","eventId")
);

-- CreateTable
CREATE TABLE "event_lecturers" (
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "event_lecturers_pkey" PRIMARY KEY ("eventId","personId")
);

-- CreateTable
CREATE TABLE "people_merge_operations" (
    "id" TEXT NOT NULL,
    "targetPersonId" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "mergeCandidateId" TEXT,
    "status" "PeopleMergeOperationStatus" NOT NULL DEFAULT 'APPLIED',
    "migratedFields" JSONB NOT NULL,
    "targetSnapshot" JSONB NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "movedRelations" JSONB NOT NULL,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "people_merge_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_candidates" (
    "id" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "matchMethod" "MergeMatchMethod",
    "matchValue" TEXT,
    "status" "MergeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "merge_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "template" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "certificateFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "CertificateScope" NOT NULL,
    "majorEventId" TEXT,
    "eventGroupId" TEXT,
    "eventId" TEXT,
    "certificateTemplateId" TEXT NOT NULL,
    "certificateText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "issuedTo" "CertificateIssuedTo" NOT NULL DEFAULT 'OTHER',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "certificate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "renderedData" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "certificateTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_identityDocument_idx" ON "users"("identityDocument");

-- CreateIndex
CREATE INDEX "users_academicId_idx" ON "users"("academicId");

-- CreateIndex
CREATE INDEX "major_events_startDate_idx" ON "major_events"("startDate");

-- CreateIndex
CREATE INDEX "major_events_endDate_idx" ON "major_events"("endDate");

-- CreateIndex
CREATE INDEX "major_events_deletedAt_idx" ON "major_events"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "major_events_name_deletedAt_key" ON "major_events"("name", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_info_majorEventId_key" ON "payment_info"("majorEventId");

-- CreateIndex
CREATE INDEX "event_groups_deletedAt_idx" ON "event_groups"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_groups_name_deletedAt_key" ON "event_groups"("name", "deletedAt");

-- CreateIndex
CREATE INDEX "events_startDate_idx" ON "events"("startDate");

-- CreateIndex
CREATE INDEX "events_endDate_idx" ON "events"("endDate");

-- CreateIndex
CREATE INDEX "events_majorEventId_idx" ON "events"("majorEventId");

-- CreateIndex
CREATE INDEX "events_eventGroupId_idx" ON "events"("eventGroupId");

-- CreateIndex
CREATE INDEX "events_deletedAt_idx" ON "events"("deletedAt");

-- CreateIndex
CREATE INDEX "event_subscriptions_eventId_idx" ON "event_subscriptions"("eventId");

-- CreateIndex
CREATE INDEX "event_subscriptions_eventGroupSubscriptionId_idx" ON "event_subscriptions"("eventGroupSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "event_subscriptions_eventId_personId_deletedAt_key" ON "event_subscriptions"("eventId", "personId", "deletedAt");

-- CreateIndex
CREATE INDEX "event_group_subscriptions_eventGroupId_idx" ON "event_group_subscriptions"("eventGroupId");

-- CreateIndex
CREATE INDEX "event_group_subscriptions_personId_idx" ON "event_group_subscriptions"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "event_group_subscriptions_eventGroupId_personId_deletedAt_key" ON "event_group_subscriptions"("eventGroupId", "personId", "deletedAt");

-- CreateIndex
CREATE INDEX "major_event_subscriptions_majorEventId_idx" ON "major_event_subscriptions"("majorEventId");

-- CreateIndex
CREATE UNIQUE INDEX "major_event_subscriptions_majorEventId_personId_deletedAt_key" ON "major_event_subscriptions"("majorEventId", "personId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "major_event_prices_majorEventId_key" ON "major_event_prices"("majorEventId");

-- CreateIndex
CREATE INDEX "price_tiers_priceId_idx" ON "price_tiers"("priceId");

-- CreateIndex
CREATE UNIQUE INDEX "people_externalRef_key" ON "people"("externalRef");

-- CreateIndex
CREATE INDEX "people_name_idx" ON "people"("name");

-- CreateIndex
CREATE INDEX "people_email_idx" ON "people"("email");

-- CreateIndex
CREATE INDEX "people_identityDocument_idx" ON "people"("identityDocument");

-- CreateIndex
CREATE INDEX "people_academicId_idx" ON "people"("academicId");

-- CreateIndex
CREATE INDEX "people_userId_idx" ON "people"("userId");

-- CreateIndex
CREATE INDEX "people_mergedIntoId_idx" ON "people"("mergedIntoId");

-- CreateIndex
CREATE INDEX "people_deletedAt_idx" ON "people"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "people_identityDocument_deletedAt_key" ON "people"("identityDocument", "deletedAt");

-- CreateIndex
CREATE INDEX "event_attendances_eventId_idx" ON "event_attendances"("eventId");

-- CreateIndex
CREATE INDEX "event_attendances_personId_idx" ON "event_attendances"("personId");

-- CreateIndex
CREATE INDEX "event_lecturers_personId_idx" ON "event_lecturers"("personId");

-- CreateIndex
CREATE INDEX "people_merge_operations_targetPersonId_idx" ON "people_merge_operations"("targetPersonId");

-- CreateIndex
CREATE INDEX "people_merge_operations_sourcePersonId_idx" ON "people_merge_operations"("sourcePersonId");

-- CreateIndex
CREATE INDEX "people_merge_operations_mergeCandidateId_idx" ON "people_merge_operations"("mergeCandidateId");

-- CreateIndex
CREATE INDEX "people_merge_operations_status_idx" ON "people_merge_operations"("status");

-- CreateIndex
CREATE INDEX "people_merge_operations_rolledBackById_idx" ON "people_merge_operations"("rolledBackById");

-- CreateIndex
CREATE INDEX "people_merge_operations_createdById_idx" ON "people_merge_operations"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "merge_candidates_pairKey_key" ON "merge_candidates"("pairKey");

-- CreateIndex
CREATE INDEX "merge_candidates_personAId_idx" ON "merge_candidates"("personAId");

-- CreateIndex
CREATE INDEX "merge_candidates_personBId_idx" ON "merge_candidates"("personBId");

-- CreateIndex
CREATE INDEX "merge_candidates_status_idx" ON "merge_candidates"("status");

-- CreateIndex
CREATE INDEX "merge_candidates_matchMethod_idx" ON "merge_candidates"("matchMethod");

-- CreateIndex
CREATE INDEX "merge_candidates_resolvedById_idx" ON "merge_candidates"("resolvedById");

-- CreateIndex
CREATE INDEX "certificate_templates_name_idx" ON "certificate_templates"("name");

-- CreateIndex
CREATE INDEX "certificate_configs_scope_idx" ON "certificate_configs"("scope");

-- CreateIndex
CREATE INDEX "certificate_configs_majorEventId_idx" ON "certificate_configs"("majorEventId");

-- CreateIndex
CREATE INDEX "certificate_configs_eventGroupId_idx" ON "certificate_configs"("eventGroupId");

-- CreateIndex
CREATE INDEX "certificate_configs_eventId_idx" ON "certificate_configs"("eventId");

-- CreateIndex
CREATE INDEX "certificate_configs_certificateTemplateId_idx" ON "certificate_configs"("certificateTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_configs_eventId_name_key" ON "certificate_configs"("eventId", "name");

-- CreateIndex
CREATE INDEX "certificates_personId_idx" ON "certificates"("personId");

-- CreateIndex
CREATE INDEX "certificates_configId_idx" ON "certificates"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_personId_configId_key" ON "certificates"("personId", "configId");

-- AddForeignKey
ALTER TABLE "payment_info" ADD CONSTRAINT "payment_info_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_eventGroupSubscriptionId_fkey" FOREIGN KEY ("eventGroupSubscriptionId") REFERENCES "event_group_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_subscriptions" ADD CONSTRAINT "event_group_subscriptions_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_subscriptions" ADD CONSTRAINT "event_group_subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major_event_subscriptions" ADD CONSTRAINT "major_event_subscriptions_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major_event_subscriptions" ADD CONSTRAINT "major_event_subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "major_event_prices" ADD CONSTRAINT "major_event_prices_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "major_event_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_lecturers" ADD CONSTRAINT "event_lecturers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_lecturers" ADD CONSTRAINT "event_lecturers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_merge_operations" ADD CONSTRAINT "people_merge_operations_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_merge_operations" ADD CONSTRAINT "people_merge_operations_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_merge_operations" ADD CONSTRAINT "people_merge_operations_mergeCandidateId_fkey" FOREIGN KEY ("mergeCandidateId") REFERENCES "merge_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_configs" ADD CONSTRAINT "certificate_configs_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_configs" ADD CONSTRAINT "certificate_configs_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_configs" ADD CONSTRAINT "certificate_configs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_configs" ADD CONSTRAINT "certificate_configs_certificateTemplateId_fkey" FOREIGN KEY ("certificateTemplateId") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_configId_fkey" FOREIGN KEY ("configId") REFERENCES "certificate_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_certificateTemplateId_fkey" FOREIGN KEY ("certificateTemplateId") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
