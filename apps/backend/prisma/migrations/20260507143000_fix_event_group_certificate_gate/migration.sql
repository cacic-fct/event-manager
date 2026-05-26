-- Promote major-event groups that were implicitly issuing certificates through
-- their child events. The group flag is the gate; event flags remain the
-- per-event inclusion list once the gate is open.
UPDATE "event_groups" AS "group"
SET "shouldIssueCertificate" = true
WHERE "group"."deletedAt" IS NULL
  AND "group"."shouldIssueCertificate" = false
  AND EXISTS (
    SELECT 1
    FROM "events" AS "event"
    WHERE "event"."eventGroupId" = "group"."id"
      AND "event"."deletedAt" IS NULL
      AND "event"."majorEventId" IS NOT NULL
      AND "event"."shouldIssueCertificate" = true
  );

-- A group that participates in a major event cannot issue one certificate per
-- event through the group setting, because the major event issues one
-- certificate containing the eligible events.
UPDATE "event_groups" AS "group"
SET "shouldIssueCertificateForEachEvent" = false
WHERE "group"."deletedAt" IS NULL
  AND "group"."shouldIssueCertificateForEachEvent" = true
  AND EXISTS (
    SELECT 1
    FROM "events" AS "event"
    WHERE "event"."eventGroupId" = "group"."id"
      AND "event"."deletedAt" IS NULL
      AND "event"."majorEventId" IS NOT NULL
  );

-- Closed groups cannot issue certificates themselves, partially, per event, or
-- through their child events.
UPDATE "event_groups"
SET
  "shouldIssueCertificateForEachEvent" = false,
  "shouldIssuePartialCertificate" = false
WHERE "deletedAt" IS NULL
  AND "shouldIssueCertificate" = false
  AND (
    "shouldIssueCertificateForEachEvent" = true
    OR "shouldIssuePartialCertificate" = true
  );

UPDATE "events" AS "event"
SET "shouldIssueCertificate" = false
FROM "event_groups" AS "group"
WHERE "event"."eventGroupId" = "group"."id"
  AND "event"."deletedAt" IS NULL
  AND "group"."deletedAt" IS NULL
  AND "group"."shouldIssueCertificate" = false
  AND "event"."shouldIssueCertificate" = true;
