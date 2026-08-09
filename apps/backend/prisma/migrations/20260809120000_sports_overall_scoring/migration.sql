-- AlterTable
ALTER TABLE "sports_categories"
ADD COLUMN "overallScoringRules" JSONB NOT NULL DEFAULT '{}';
