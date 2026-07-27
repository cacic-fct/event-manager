ALTER TABLE "people" ADD COLUMN "lgpdDeletionRequestId" TEXT;
ALTER TABLE "people" ALTER COLUMN "deletedAt" DROP NOT NULL;
ALTER TABLE "event_subscriptions" ADD COLUMN "lgpdDeletionRequestId" TEXT;
ALTER TABLE "event_group_subscriptions" ADD COLUMN "lgpdDeletionRequestId" TEXT;
ALTER TABLE "major_event_subscriptions" ADD COLUMN "lgpdDeletionRequestId" TEXT;
ALTER TABLE "major_event_subscription_event_selections" ADD COLUMN "lgpdDeletionRequestId" TEXT;
ALTER TABLE "certificates" ADD COLUMN "lgpdDeletionRequestId" TEXT;

CREATE INDEX "people_lgpdDeletionRequestId_idx" ON "people"("lgpdDeletionRequestId");
CREATE INDEX "event_subscriptions_lgpdDeletionRequestId_idx" ON "event_subscriptions"("lgpdDeletionRequestId");
CREATE INDEX "event_group_subscriptions_lgpdDeletionRequestId_idx" ON "event_group_subscriptions"("lgpdDeletionRequestId");
CREATE INDEX "major_event_subscriptions_lgpdDeletionRequestId_idx" ON "major_event_subscriptions"("lgpdDeletionRequestId");
CREATE INDEX "major_event_subscription_event_selections_lgpdDeletionRequestId_idx" ON "major_event_subscription_event_selections"("lgpdDeletionRequestId");
CREATE INDEX "certificates_lgpdDeletionRequestId_idx" ON "certificates"("lgpdDeletionRequestId");
