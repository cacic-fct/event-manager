-- AlterTable
ALTER TABLE "major_events"
ADD COLUMN "requiresImageLicenseAgreement" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "events"
ADD COLUMN "requiresImageLicenseAgreement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_groups"
ADD COLUMN "requiresImageLicenseAgreement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_subscriptions"
ADD COLUMN "imageLicenseAgreementAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_group_subscriptions"
ADD COLUMN "imageLicenseAgreementAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "major_event_subscriptions"
ADD COLUMN "imageLicenseAgreementAccepted" BOOLEAN NOT NULL DEFAULT false;
