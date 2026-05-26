ALTER TABLE "major_events"
  ADD COLUMN "shouldIssueCertificateForNonPayingAttendees" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shouldIssueCertificateForNonSubscribedAttendees" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "event_groups"
  ADD COLUMN "shouldIssueCertificateForNonPayingAttendees" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shouldIssueCertificateForNonSubscribedAttendees" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "events"
  ADD COLUMN "shouldIssueCertificateForNonPayingAttendees" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shouldIssueCertificateForNonSubscribedAttendees" BOOLEAN NOT NULL DEFAULT false;
