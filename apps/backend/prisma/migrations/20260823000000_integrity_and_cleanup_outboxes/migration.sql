-- Active subscriptions are logical singletons. Do not silently archive or
-- delete existing rows: deployment must stop for explicit reconciliation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "major_event_subscriptions"
    WHERE "deletedAt" IS NULL
    GROUP BY "majorEventId", "personId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create major_event_subscription_unique_active: duplicate active major-event subscriptions require manual reconciliation';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "major_event_subscription_unique_active"
ON "major_event_subscriptions" ("majorEventId", "personId")
WHERE "deletedAt" IS NULL;

CREATE TYPE "CertificateNotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'SUPERSEDED');

CREATE TABLE "certificate_notification_outbox" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" "CertificateNotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_notification_outbox_certificate_issued_key"
ON "certificate_notification_outbox"("certificateId", "issuedAt");

CREATE INDEX "certificate_notification_outbox_pending_idx"
ON "certificate_notification_outbox"("status", "nextAttemptAt");

ALTER TABLE "certificate_notification_outbox"
ADD CONSTRAINT "certificate_notification_outbox_certificateId_fkey"
FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "LgpdStorageCleanupStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELETED');

CREATE TABLE "lgpd_storage_cleanup_outbox" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "LgpdStorageCleanupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lgpd_storage_cleanup_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lgpd_storage_cleanup_outbox_request_object_key"
ON "lgpd_storage_cleanup_outbox"("requestId", "objectKey");

CREATE INDEX "lgpd_storage_cleanup_outbox_pending_idx"
ON "lgpd_storage_cleanup_outbox"("status", "nextAttemptAt");

-- Precondition: existing rows must have globally unique clientId values.
-- This intentionally fails rather than silently deduplicating historical data.
DO $$
BEGIN
  IF EXISTS (
    SELECT "clientId"
    FROM "offline_event_attendance_submissions"
    GROUP BY "clientId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'offline attendance clientId duplicates require manual reconciliation before this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "offline_event_attendance_submissions_client_id_key"
ON "offline_event_attendance_submissions"("clientId");
