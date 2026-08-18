CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
DECLARE
  invalid_coordinates record;
BEGIN
  SELECT source, invalid_count
  INTO invalid_coordinates
  FROM (
    SELECT 'events' AS source, count(*) AS invalid_count
    FROM "events"
    WHERE (latitude IS NULL) <> (longitude IS NULL)
       OR latitude NOT BETWEEN -90 AND 90
       OR longitude NOT BETWEEN -180 AND 180
    UNION ALL
    SELECT 'place_presets', count(*)
    FROM "place_presets"
    WHERE (latitude IS NULL) <> (longitude IS NULL)
       OR latitude NOT BETWEEN -90 AND 90
       OR longitude NOT BETWEEN -180 AND 180
    UNION ALL
    SELECT 'event_attendances', count(*)
    FROM "event_attendances"
    WHERE ("collectedLatitude" IS NULL) <> ("collectedLongitude" IS NULL)
       OR "collectedLatitude" NOT BETWEEN -90 AND 90
       OR "collectedLongitude" NOT BETWEEN -180 AND 180
    UNION ALL
    SELECT 'offline_event_attendance_submissions', count(*)
    FROM "offline_event_attendance_submissions"
    WHERE ("collectedLatitude" IS NULL) <> ("collectedLongitude" IS NULL)
       OR "collectedLatitude" NOT BETWEEN -90 AND 90
       OR "collectedLongitude" NOT BETWEEN -180 AND 180
  ) coordinate_checks
  WHERE invalid_count > 0
  ORDER BY source
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '% contains % invalid coordinate pair(s); correct them before enabling PostGIS',
      invalid_coordinates.source,
      invalid_coordinates.invalid_count;
  END IF;
END $$;

ALTER TABLE "events"
  ADD CONSTRAINT "events_coordinates_check"
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (
        latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      )
    ),
  ADD COLUMN "location" geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END
    ) STORED;

ALTER TABLE "place_presets"
  ADD CONSTRAINT "place_presets_coordinates_check"
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (
        latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      )
    ),
  ADD COLUMN "location" geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END
    ) STORED;

ALTER TABLE "event_attendances"
  ADD CONSTRAINT "event_attendances_coordinates_check"
    CHECK (
      ("collectedLatitude" IS NULL AND "collectedLongitude" IS NULL)
      OR (
        "collectedLatitude" IS NOT NULL AND "collectedLongitude" IS NOT NULL
        AND "collectedLatitude" BETWEEN -90 AND 90 AND "collectedLongitude" BETWEEN -180 AND 180
      )
    ),
  ADD COLUMN "collectedLocation" geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN "collectedLatitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("collectedLongitude", "collectedLatitude"), 4326)::geography END
    ) STORED;

ALTER TABLE "offline_event_attendance_submissions"
  ADD CONSTRAINT "offline_attendance_submissions_coordinates_check"
    CHECK (
      ("collectedLatitude" IS NULL AND "collectedLongitude" IS NULL)
      OR (
        "collectedLatitude" IS NOT NULL AND "collectedLongitude" IS NOT NULL
        AND "collectedLatitude" BETWEEN -90 AND 90 AND "collectedLongitude" BETWEEN -180 AND 180
      )
    ),
  ADD COLUMN "collectedLocation" geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN "collectedLatitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("collectedLongitude", "collectedLatitude"), 4326)::geography END
    ) STORED;

CREATE INDEX "events_location_gist_idx" ON "events" USING GIST ("location");
CREATE INDEX "place_presets_location_gist_idx" ON "place_presets" USING GIST ("location");
CREATE INDEX "event_attendances_collected_location_gist_idx"
  ON "event_attendances" USING GIST ("collectedLocation");
CREATE INDEX "offline_attendance_collected_location_gist_idx"
  ON "offline_event_attendance_submissions" USING GIST ("collectedLocation");
