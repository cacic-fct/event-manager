CREATE TABLE "external_import_records" (
    "sourceNamespace" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_import_records_pkey" PRIMARY KEY ("sourceNamespace", "entityType", "sourceId")
);

CREATE INDEX "external_import_records_entityType_targetId_idx"
ON "external_import_records"("entityType", "targetId");
