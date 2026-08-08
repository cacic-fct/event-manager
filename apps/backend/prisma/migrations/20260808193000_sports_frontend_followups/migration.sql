-- AlterEnum
ALTER TYPE "SportsMatchActionType" ADD VALUE IF NOT EXISTS 'TIMER_RECONCILE';
ALTER TYPE "SportsMatchActionType" ADD VALUE IF NOT EXISTS 'OCCURRENCE';

-- CreateEnum
CREATE TYPE "SportsLivestreamProvider" AS ENUM ('YOUTUBE', 'TWITCH', 'GENERAL');

-- AlterTable
ALTER TABLE "sports_tournaments"
  ADD COLUMN "selfSubscriptionAllowNoTeam" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfSubscriptionAllowNoCategory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sports_categories"
  ADD COLUMN "timerRules" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "sports_matches"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "occurrences" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "livestreamProvider" "SportsLivestreamProvider",
  ADD COLUMN "livestreamUrl" TEXT;

-- AlterTable
ALTER TABLE "sports_match_roster_entries"
  ADD COLUMN "shirtNumber" TEXT,
  ADD COLUMN "roleMetadata" JSONB;

-- AlterTable
ALTER TABLE "sports_player_applications"
  ALTER COLUMN "requestedTeamId" DROP NOT NULL;
