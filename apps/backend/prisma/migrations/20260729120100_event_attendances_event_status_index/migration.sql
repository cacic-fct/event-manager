-- CreateIndex
DROP INDEX CONCURRENTLY IF EXISTS "event_attendances_eventId_status_idx";
CREATE INDEX CONCURRENTLY "event_attendances_eventId_status_idx"
ON "event_attendances"("eventId", "status");
