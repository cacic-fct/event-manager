CREATE TYPE "PublicationPreviewTargetType" AS ENUM (
  'EVENT',
  'EVENT_GROUP',
  'MAJOR_EVENT'
);

ALTER TABLE "public_content_previews"
ALTER COLUMN "targetType"
TYPE "PublicationPreviewTargetType"
USING "targetType"::text::"PublicationPreviewTargetType";

DROP TYPE "PublishContentPreviewTargetType";

ALTER TABLE "public_content_previews" RENAME TO "publication_previews";
