DROP INDEX IF EXISTS "major_events_name_deletedAt_key";
DROP INDEX IF EXISTS "place_presets_name_deletedAt_key";
DROP INDEX IF EXISTS "event_groups_name_deletedAt_key";

ALTER TABLE "certificate_configs"
ADD CONSTRAINT "certificate_configs_scope_target_check"
CHECK (
  (
    "scope" = 'MAJOR_EVENT'
    AND "majorEventId" IS NOT NULL
    AND "eventGroupId" IS NULL
    AND "eventId" IS NULL
  )
  OR (
    "scope" = 'EVENT_GROUP'
    AND "majorEventId" IS NULL
    AND "eventGroupId" IS NOT NULL
    AND "eventId" IS NULL
  )
  OR (
    "scope" = 'EVENT'
    AND "majorEventId" IS NULL
    AND "eventGroupId" IS NULL
    AND "eventId" IS NOT NULL
  )
  OR (
    "scope" = 'OTHER'
    AND "majorEventId" IS NULL
    AND "eventGroupId" IS NULL
    AND "eventId" IS NULL
  )
) NOT VALID;

CREATE INDEX "major_events_active_name_idx"
ON "major_events"("name")
WHERE "deletedAt" IS NULL;

CREATE INDEX "place_presets_active_name_idx"
ON "place_presets"("name")
WHERE "deletedAt" IS NULL;

CREATE INDEX "event_groups_active_name_idx"
ON "event_groups"("name")
WHERE "deletedAt" IS NULL;
