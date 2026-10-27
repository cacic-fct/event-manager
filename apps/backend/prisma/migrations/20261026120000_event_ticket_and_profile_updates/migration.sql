BEGIN;

ALTER TABLE "events"
  ADD COLUMN "locationName" TEXT,
  ADD COLUMN "locationInternalNotes" TEXT,
  ADD COLUMN "isVirtual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subscriberInformation" TEXT,
  ADD COLUMN "subscriberInformationUpdatedAt" TIMESTAMP(3);
ALTER TABLE "place_presets" ADD COLUMN "internalNotes" TEXT;

-- Split only the first exact separator. Free text without it remains the name.
-- Online events deliberately have no physical place or coordinates.
UPDATE "events" SET
  "isVirtual" = btrim("locationDescription") = 'Evento on-line',
  "locationName" = CASE
    WHEN btrim("locationDescription") = 'Evento on-line' THEN NULL
    ELSE NULLIF(btrim(split_part("locationDescription", ' - ', 1)), '') END,
  "locationDescription" = CASE
    WHEN btrim("locationDescription") = 'Evento on-line' THEN NULL
    WHEN strpos("locationDescription", ' - ') > 0
      THEN NULLIF(btrim(substr("locationDescription", strpos("locationDescription", ' - ') + 3)), '')
    ELSE NULL END,
  "latitude" = CASE WHEN btrim("locationDescription") = 'Evento on-line' THEN NULL ELSE "latitude" END,
  "longitude" = CASE WHEN btrim("locationDescription") = 'Evento on-line' THEN NULL ELSE "longitude" END
WHERE "locationDescription" IS NOT NULL;

-- Canonical public name replaces the redundant item title. Preserve a distinct
-- legacy title in admin notes instead of silently losing it.
UPDATE "place_presets" SET
  "internalNotes" = CASE
    WHEN NULLIF(btrim("locationDescription"), '') IS NOT NULL AND btrim("name") <> btrim("locationDescription")
      THEN 'Nome anterior do cadastro: ' || "name" ELSE NULL END,
  "name" = btrim(split_part(COALESCE(NULLIF(btrim("locationDescription"), ''), "name"), ' - ', 1)),
  "locationDescription" = CASE
    WHEN strpos(COALESCE(NULLIF(btrim("locationDescription"), ''), "name"), ' - ') > 0
      THEN NULLIF(btrim(substr(COALESCE(NULLIF(btrim("locationDescription"), ''), "name"),
        strpos(COALESCE(NULLIF(btrim("locationDescription"), ''), "name"), ' - ') + 3)), '')
    ELSE NULL END;
-- Keep IDs/audit history intact; these are no longer selectable physical places.
UPDATE "place_presets" SET "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP)
WHERE "name" = 'Evento on-line';

-- Existing JSON drafts need the same split; otherwise applying one reintroduces
-- the old combined field after the schema migration.
UPDATE "event_drafts" SET "payload" = "payload" || jsonb_build_object(
  'isVirtual', btrim("payload"->>'locationDescription') = 'Evento on-line',
  'locationName', CASE WHEN btrim("payload"->>'locationDescription') = 'Evento on-line' THEN NULL
    ELSE NULLIF(btrim(split_part("payload"->>'locationDescription', ' - ', 1)), '') END,
  'locationDescription', CASE WHEN btrim("payload"->>'locationDescription') = 'Evento on-line' THEN NULL
    WHEN strpos("payload"->>'locationDescription', ' - ') > 0
      THEN NULLIF(btrim(substr("payload"->>'locationDescription', strpos("payload"->>'locationDescription', ' - ') + 3)), '')
    ELSE NULL END
) || CASE WHEN btrim("payload"->>'locationDescription') = 'Evento on-line'
  THEN '{"latitude":null,"longitude":null}'::jsonb ELSE '{}'::jsonb END
WHERE jsonb_typeof("payload"->'locationDescription') = 'string' AND NOT ("payload" ? 'locationName');

UPDATE "event_drafts" SET "payload" = "payload" || '{"locationName":null}'::jsonb
WHERE "payload" ? 'locationDescription' AND jsonb_typeof("payload"->'locationDescription') = 'null'
  AND NOT ("payload" ? 'locationName');

ALTER TABLE "events" ADD CONSTRAINT "events_virtual_location" CHECK (
  NOT "isVirtual" OR ("locationName" IS NULL AND "locationDescription" IS NULL AND "latitude" IS NULL AND "longitude" IS NULL));

-- Keep historical snapshots intact. Undo translates only these legacy combined
-- values; later description-only edits already use the structured format.
UPDATE "audit_log_entries" SET "metadata" =
  CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END
  || '{"eventLocationFormat":"legacy-combined"}'::jsonb
WHERE "entityType" = 'EVENT' AND 'locationDescription' = ANY("changedFields");

COMMIT;

ALTER TYPE "TicketHistoryOperation" ADD VALUE 'HOLDER_CHANGED';
ALTER TYPE "TicketHistoryOperation" ADD VALUE 'RESTORED';

ALTER TABLE "lecturer_profiles" ADD COLUMN "selfEditingBlocked" BOOLEAN NOT NULL DEFAULT false;
