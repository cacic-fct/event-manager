ALTER TABLE "sports_tournaments"
ADD COLUMN "shouldIssueCertificate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sports_categories"
ADD COLUMN "shouldIssueCertificate" BOOLEAN;

UPDATE "event_groups" AS event_group
SET "name" = CONCAT_WS(
  ' — ',
  major_event."name",
  category."name",
  NULLIF(BTRIM(category."division"), '')
)
FROM "sports_categories" AS category
JOIN "sports_tournaments" AS tournament ON tournament."id" = category."tournamentId"
JOIN "major_events" AS major_event ON major_event."id" = tournament."majorEventId"
WHERE event_group."id" = category."eventGroupId"
  AND category."deletedAt" IS NULL
  AND tournament."deletedAt" IS NULL;
