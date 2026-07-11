CREATE TYPE "PublishContentPreviewTargetType" AS ENUM (
  'EVENT',
  'EVENT_GROUP',
  'MAJOR_EVENT'
);

ALTER TABLE "public_content_previews"
ALTER COLUMN "targetType"
TYPE "PublishContentPreviewTargetType"
USING "targetType"::text::"PublishContentPreviewTargetType";

DROP TYPE "PublicContentPreviewTargetType";