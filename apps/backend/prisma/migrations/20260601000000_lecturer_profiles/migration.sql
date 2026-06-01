CREATE TABLE "lecturer_profiles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "biography" TEXT NOT NULL,
    "publishGoogleUserPicture" BOOLEAN NOT NULL DEFAULT false,
    "googleUserPicture" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "lecturer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lecturer_profiles_personId_key" ON "lecturer_profiles"("personId");
CREATE INDEX "lecturer_profiles_displayName_idx" ON "lecturer_profiles"("displayName");

ALTER TABLE "lecturer_profiles"
ADD CONSTRAINT "lecturer_profiles_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "people"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
