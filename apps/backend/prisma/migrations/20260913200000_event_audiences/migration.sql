CREATE TYPE "EventAudience" AS ENUM ('PUBLIC', 'UNESP_ONLY', 'COURSE_ONLY', 'INVITATION_ONLY');

-- Existing events and containers retain their public audience.
ALTER TABLE "events"
  ADD COLUMN "audience" "EventAudience" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "audienceCourseCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "event_groups"
  ADD COLUMN "audience" "EventAudience" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "audienceCourseCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "major_events"
  ADD COLUMN "audience" "EventAudience" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "audienceCourseCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "event_audience_invitations" (
  "eventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "notificationAttemptedAt" TIMESTAMP(3),
  CONSTRAINT "event_audience_invitations_pkey" PRIMARY KEY ("eventId", "personId"),
  CONSTRAINT "event_audience_invitations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_audience_invitations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "event_audience_invitations_personId_idx" ON "event_audience_invitations"("personId");
CREATE INDEX "event_audience_invitation_pending_idx" ON "event_audience_invitations"("notifiedAt", "notificationAttemptedAt");

CREATE TABLE "event_group_audience_invitations" (
  "eventGroupId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "notificationAttemptedAt" TIMESTAMP(3),
  CONSTRAINT "event_group_audience_invitations_pkey" PRIMARY KEY ("eventGroupId", "personId"),
  CONSTRAINT "event_group_audience_invitations_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_group_audience_invitations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "event_group_audience_invitations_personId_idx" ON "event_group_audience_invitations"("personId");
CREATE INDEX "event_group_audience_invitation_pending_idx" ON "event_group_audience_invitations"("notifiedAt", "notificationAttemptedAt");

CREATE TABLE "major_event_audience_invitations" (
  "majorEventId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "notificationAttemptedAt" TIMESTAMP(3),
  CONSTRAINT "major_event_audience_invitations_pkey" PRIMARY KEY ("majorEventId", "personId"),
  CONSTRAINT "major_event_audience_invitations_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "major_event_audience_invitations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "major_event_audience_invitations_personId_idx" ON "major_event_audience_invitations"("personId");
CREATE INDEX "major_event_audience_invitation_pending_idx" ON "major_event_audience_invitations"("notifiedAt", "notificationAttemptedAt");
