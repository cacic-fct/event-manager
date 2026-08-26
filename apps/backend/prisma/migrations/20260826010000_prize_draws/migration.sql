CREATE TYPE "PrizeDrawTargetType" AS ENUM ('EVENT', 'MAJOR_EVENT');
CREATE TYPE "PrizeDrawChanceMode" AS ENUM ('EQUAL', 'WEIGHTED');
CREATE TYPE "PrizeDrawSpeed" AS ENUM ('INSTANT', 'QUICK', 'DRAMATIC');
CREATE TYPE "PrizeDrawNotificationStatus" AS ENUM (
  'NOT_REQUESTED',
  'PENDING',
  'SENT',
  'CANCELLED',
  'FAILED',
  'DELETED'
);

CREATE TABLE "prize_draws" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "targetType" "PrizeDrawTargetType" NOT NULL,
  "eventId" TEXT,
  "majorEventId" TEXT,
  "includePresent" BOOLEAN NOT NULL DEFAULT true,
  "includeSubscribers" BOOLEAN NOT NULL DEFAULT false,
  "includeManualEntries" BOOLEAN NOT NULL DEFAULT false,
  "chanceMode" "PrizeDrawChanceMode" NOT NULL DEFAULT 'EQUAL',
  "spinLimit" INTEGER,
  "removeWinnerAfterDraw" BOOLEAN NOT NULL DEFAULT false,
  "defaultSpeed" "PrizeDrawSpeed" NOT NULL DEFAULT 'QUICK',
  "dramaticCountdownSeconds" INTEGER NOT NULL DEFAULT 3,
  "notifyWinner" BOOLEAN NOT NULL DEFAULT false,
  "frozenAt" TIMESTAMP(3),
  "frozenById" TEXT,
  "unfrozenAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "prize_draws_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draws_target_check" CHECK (
    ("targetType" = 'EVENT' AND "eventId" IS NOT NULL AND "majorEventId" IS NULL)
    OR
    ("targetType" = 'MAJOR_EVENT' AND "majorEventId" IS NOT NULL AND "eventId" IS NULL)
  ),
  CONSTRAINT "prize_draws_eligibility_check" CHECK (
    "includePresent" OR "includeSubscribers" OR "includeManualEntries"
  ),
  CONSTRAINT "prize_draws_spin_limit_check" CHECK ("spinLimit" IS NULL OR "spinLimit" > 0),
  CONSTRAINT "prize_draws_countdown_check" CHECK ("dramaticCountdownSeconds" IN (3, 5))
);

CREATE TABLE "prize_draw_planned_spins" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "description" TEXT,
  "speed" "PrizeDrawSpeed" NOT NULL,
  "countdownSeconds" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prize_draw_planned_spins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_planned_spins_position_check" CHECK ("position" > 0),
  CONSTRAINT "prize_draw_planned_spins_countdown_check" CHECK (
    "countdownSeconds" IS NULL OR "countdownSeconds" IN (3, 5)
  )
);

CREATE TABLE "prize_draw_manual_entries" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "personId" TEXT,
  "name" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prize_draw_manual_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_manual_entries_weight_check" CHECK ("weight" BETWEEN 1 AND 10000)
);

CREATE TABLE "prize_draw_weight_overrides" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prize_draw_weight_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_weight_overrides_weight_check" CHECK ("weight" BETWEEN 1 AND 10000)
);

CREATE TABLE "prize_draw_excluded_people" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prize_draw_excluded_people_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prize_draw_frozen_entries" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "personId" TEXT,
  "displayName" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "sources" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prize_draw_frozen_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_frozen_entries_weight_check" CHECK ("weight" BETWEEN 1 AND 10000)
);

CREATE TABLE "prize_draw_spins" (
  "id" TEXT NOT NULL,
  "drawId" TEXT NOT NULL,
  "plannedSpinId" TEXT,
  "sequence" INTEGER NOT NULL,
  "description" TEXT,
  "speed" "PrizeDrawSpeed" NOT NULL,
  "countdownSeconds" INTEGER,
  "repeatedSpinIndex" INTEGER NOT NULL,
  "reelDurationMs" INTEGER NOT NULL,
  "preRevealPauseMs" INTEGER NOT NULL,
  "chanceMode" "PrizeDrawChanceMode" NOT NULL,
  "removeWinnerAfterDraw" BOOLEAN NOT NULL,
  "winnerEntryKey" TEXT NOT NULL,
  "winnerPersonId" TEXT,
  "winnerDisplayName" TEXT NOT NULL,
  "winnerWeight" INTEGER NOT NULL,
  "entrantCount" INTEGER NOT NULL,
  "totalWeight" INTEGER NOT NULL,
  "duplicateEntryCount" INTEGER NOT NULL,
  "eligibilityFrozenAt" TIMESTAMP(3),
  "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "drawnById" TEXT NOT NULL,
  "undoneAt" TIMESTAMP(3),
  "undoneById" TEXT,
  "notificationTransactionId" TEXT,
  "notificationStatus" "PrizeDrawNotificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "presentationAcknowledgedAt" TIMESTAMP(3),
  "undoNotificationTransactionId" TEXT,
  "undoNotificationStatus" "PrizeDrawNotificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prize_draw_spins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_spins_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "prize_draw_spins_countdown_check" CHECK (
    "countdownSeconds" IS NULL OR "countdownSeconds" IN (3, 5)
  ),
  CONSTRAINT "prize_draw_spins_metrics_check" CHECK (
    "repeatedSpinIndex" >= 0
    AND "reelDurationMs" >= 0
    AND "preRevealPauseMs" >= 0
    AND "winnerWeight" > 0
    AND "entrantCount" > 0
    AND "totalWeight" >= "entrantCount"
    AND "duplicateEntryCount" >= "totalWeight" - "entrantCount"
  )
);

CREATE TABLE "prize_draw_spin_entries" (
  "id" TEXT NOT NULL,
  "spinId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "personId" TEXT,
  "displayName" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "sources" TEXT[] NOT NULL,
  "winner" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prize_draw_spin_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_draw_spin_entries_weight_check" CHECK ("weight" BETWEEN 1 AND 10000)
);

CREATE INDEX "prize_draws_eventId_deletedAt_idx" ON "prize_draws"("eventId", "deletedAt");
CREATE INDEX "prize_draws_majorEventId_deletedAt_idx" ON "prize_draws"("majorEventId", "deletedAt");
CREATE INDEX "prize_draws_deletedAt_updatedAt_idx" ON "prize_draws"("deletedAt", "updatedAt");
CREATE UNIQUE INDEX "prize_draw_planned_spins_drawId_position_key" ON "prize_draw_planned_spins"("drawId", "position");
CREATE INDEX "prize_draw_planned_spins_drawId_idx" ON "prize_draw_planned_spins"("drawId");
CREATE UNIQUE INDEX "prize_draw_manual_entries_drawId_personId_key" ON "prize_draw_manual_entries"("drawId", "personId");
CREATE INDEX "prize_draw_manual_entries_drawId_idx" ON "prize_draw_manual_entries"("drawId");
CREATE INDEX "prize_draw_manual_entries_personId_idx" ON "prize_draw_manual_entries"("personId");
CREATE UNIQUE INDEX "prize_draw_weight_overrides_drawId_personId_key" ON "prize_draw_weight_overrides"("drawId", "personId");
CREATE INDEX "prize_draw_weight_overrides_personId_idx" ON "prize_draw_weight_overrides"("personId");
CREATE UNIQUE INDEX "prize_draw_excluded_people_drawId_personId_key" ON "prize_draw_excluded_people"("drawId", "personId");
CREATE INDEX "prize_draw_excluded_people_personId_idx" ON "prize_draw_excluded_people"("personId");
CREATE UNIQUE INDEX "prize_draw_frozen_entries_drawId_identityKey_key" ON "prize_draw_frozen_entries"("drawId", "identityKey");
CREATE INDEX "prize_draw_frozen_entries_drawId_idx" ON "prize_draw_frozen_entries"("drawId");
CREATE INDEX "prize_draw_frozen_entries_personId_idx" ON "prize_draw_frozen_entries"("personId");
CREATE UNIQUE INDEX "prize_draw_spins_drawId_sequence_key" ON "prize_draw_spins"("drawId", "sequence");
CREATE INDEX "prize_draw_spins_drawId_undoneAt_sequence_idx" ON "prize_draw_spins"("drawId", "undoneAt", "sequence");
CREATE INDEX "prize_draw_spins_winnerPersonId_idx" ON "prize_draw_spins"("winnerPersonId");
CREATE INDEX "prize_draw_spins_notificationStatus_presentationAcknowledgedAt_idx" ON "prize_draw_spins"("notificationStatus", "presentationAcknowledgedAt");
CREATE INDEX "prize_draw_spins_plannedSpinId_idx" ON "prize_draw_spins"("plannedSpinId");
CREATE UNIQUE INDEX "prize_draw_spin_entries_spinId_identityKey_key" ON "prize_draw_spin_entries"("spinId", "identityKey");
CREATE INDEX "prize_draw_spin_entries_spinId_idx" ON "prize_draw_spin_entries"("spinId");
CREATE INDEX "prize_draw_spin_entries_personId_idx" ON "prize_draw_spin_entries"("personId");

ALTER TABLE "prize_draws"
  ADD CONSTRAINT "prize_draws_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draws_majorEventId_fkey"
  FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prize_draw_planned_spins"
  ADD CONSTRAINT "prize_draw_planned_spins_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prize_draw_manual_entries"
  ADD CONSTRAINT "prize_draw_manual_entries_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_manual_entries_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prize_draw_weight_overrides"
  ADD CONSTRAINT "prize_draw_weight_overrides_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_weight_overrides_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prize_draw_excluded_people"
  ADD CONSTRAINT "prize_draw_excluded_people_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_excluded_people_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prize_draw_frozen_entries"
  ADD CONSTRAINT "prize_draw_frozen_entries_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_frozen_entries_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prize_draw_spins"
  ADD CONSTRAINT "prize_draw_spins_drawId_fkey"
  FOREIGN KEY ("drawId") REFERENCES "prize_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_spins_plannedSpinId_fkey"
  FOREIGN KEY ("plannedSpinId") REFERENCES "prize_draw_planned_spins"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_spins_winnerPersonId_fkey"
  FOREIGN KEY ("winnerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prize_draw_spin_entries"
  ADD CONSTRAINT "prize_draw_spin_entries_spinId_fkey"
  FOREIGN KEY ("spinId") REFERENCES "prize_draw_spins"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "prize_draw_spin_entries_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
