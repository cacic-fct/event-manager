-- CreateTable
CREATE TABLE "place_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationDescription" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "place_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "place_presets_name_idx" ON "place_presets"("name");

-- CreateIndex
CREATE INDEX "place_presets_deletedAt_idx" ON "place_presets"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "place_presets_name_deletedAt_key" ON "place_presets"("name", "deletedAt");
