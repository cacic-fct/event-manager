ALTER TABLE "certificate_configs"
  ADD COLUMN "shouldAutofillSecondPage" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "secondPageText" TEXT;
