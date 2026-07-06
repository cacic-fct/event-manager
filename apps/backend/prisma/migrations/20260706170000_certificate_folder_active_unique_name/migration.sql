CREATE UNIQUE INDEX "certificate_folders_active_name_key"
ON "certificate_folders"(LOWER("name"))
WHERE "deletedAt" IS NULL;
