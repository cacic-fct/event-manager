ALTER TABLE "event_forms" ADD COLUMN "allowResponseEdits" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_form_responses" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "event_form_responses_deletedAt_idx" ON "event_form_responses"("deletedAt");
