-- AlterTable
ALTER TABLE "major_event_subscription_event_selections" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "major_event_subscription_event_selections_subscriptionId_eventI" RENAME TO "major_event_subscription_event_selections_subscriptionId_ev_key";
