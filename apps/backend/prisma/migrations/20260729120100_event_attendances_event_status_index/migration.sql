-- CreateIndex
DROP INDEX IF EXISTS "event_attendances_eventId_status_idx";
CREATE INDEX "event_attendances_eventId_status_idx"
ON "event_attendances"("eventId", "status");
