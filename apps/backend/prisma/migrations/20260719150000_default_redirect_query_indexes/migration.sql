-- CreateIndex
CREATE INDEX "events_startDate_endDate_idx" ON "events"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "major_events_subscriptionStartDate_subscriptionEndDate_idx"
ON "major_events"("subscriptionStartDate", "subscriptionEndDate");

-- CreateIndex
CREATE INDEX "event_subscriptions_personId_deletedAt_eventId_idx"
ON "event_subscriptions"("personId", "deletedAt", "eventId");

-- CreateIndex
CREATE INDEX "major_event_subscriptions_personId_deletedAt_subscriptionStatus_majorEventId_idx"
ON "major_event_subscriptions"("personId", "deletedAt", "subscriptionStatus", "majorEventId");
