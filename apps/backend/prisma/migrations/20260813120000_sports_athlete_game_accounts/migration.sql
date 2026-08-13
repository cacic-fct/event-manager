-- CreateEnum
CREATE TYPE "SportsAthleteIdentifierMode" AS ENUM ('SHIRT_NUMBER', 'GAME_ACCOUNT');

-- AlterTable
ALTER TABLE "sports_categories"
ADD COLUMN "athleteIdentifierMode" "SportsAthleteIdentifierMode" NOT NULL DEFAULT 'SHIRT_NUMBER',
ADD COLUMN "joiningInstructions" TEXT;

-- AlterTable
ALTER TABLE "sports_registration_members"
ADD COLUMN "gameNickname" TEXT,
ADD COLUMN "gameAccountName" TEXT,
ADD COLUMN "gameAccountUrl" TEXT;
