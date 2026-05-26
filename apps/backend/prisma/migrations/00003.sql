CREATE TABLE IF NOT EXISTS event_group_subscriptions (
  id TEXT PRIMARY KEY,
  "eventGroupId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "event_group_subscriptions_eventGroupId_fkey"
    FOREIGN KEY ("eventGroupId") REFERENCES event_groups(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT "event_group_subscriptions_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES people(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

ALTER TABLE event_subscriptions
ADD COLUMN IF NOT EXISTS "eventGroupSubscriptionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_subscriptions_eventGroupSubscriptionId_fkey'
  ) THEN
    ALTER TABLE event_subscriptions
    ADD CONSTRAINT "event_subscriptions_eventGroupSubscriptionId_fkey"
      FOREIGN KEY ("eventGroupSubscriptionId")
      REFERENCES event_group_subscriptions(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS event_group_subscriptions_event_group_id_idx
ON event_group_subscriptions ("eventGroupId");

CREATE INDEX IF NOT EXISTS event_group_subscriptions_person_id_idx
ON event_group_subscriptions ("personId");

CREATE INDEX IF NOT EXISTS event_subscriptions_event_group_subscription_id_idx
ON event_subscriptions ("eventGroupSubscriptionId");

CREATE UNIQUE INDEX IF NOT EXISTS event_group_subscription_unique_active
ON event_group_subscriptions ("eventGroupId", "personId")
WHERE "deletedAt" IS NULL;

INSERT INTO event_group_subscriptions (
  id,
  "eventGroupId",
  "personId",
  "createdAt",
  "createdById",
  "deletedAt"
)
SELECT
  'egs_' || md5(es."personId" || ':' || e."eventGroupId"),
  e."eventGroupId",
  es."personId",
  MIN(es."createdAt"),
  MIN(es."createdById"),
  NULL
FROM event_subscriptions es
INNER JOIN events e
  ON e.id = es."eventId"
WHERE es."deletedAt" IS NULL
  AND e."deletedAt" IS NULL
  AND e."eventGroupId" IS NOT NULL
  AND e."majorEventId" IS NULL
GROUP BY e."eventGroupId", es."personId"
ON CONFLICT DO NOTHING;

UPDATE event_subscriptions es
SET "eventGroupSubscriptionId" = egs.id
FROM events e
INNER JOIN event_group_subscriptions egs
  ON egs."eventGroupId" = e."eventGroupId"
WHERE e.id = es."eventId"
  AND egs."personId" = es."personId"
  AND egs."deletedAt" IS NULL
  AND es."deletedAt" IS NULL
  AND e."deletedAt" IS NULL
  AND e."eventGroupId" IS NOT NULL
  AND e."majorEventId" IS NULL
  AND es."eventGroupSubscriptionId" IS NULL;
