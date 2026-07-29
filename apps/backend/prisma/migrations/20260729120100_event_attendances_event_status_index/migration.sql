-- CreateIndex
CREATE INDEX CONCURRENTLY "event_attendances_eventId_status_idx"
ON "event_attendances"("eventId", "status");
