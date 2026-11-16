CREATE TABLE "content_reviews" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "eventId" TEXT,
    "changes" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_reviews_one_target" CHECK (num_nonnulls("personId", "eventId") = 1)
);

CREATE UNIQUE INDEX "content_reviews_personId_key" ON "content_reviews"("personId");
CREATE UNIQUE INDEX "content_reviews_eventId_key" ON "content_reviews"("eventId");
CREATE INDEX "content_reviews_updatedAt_id_idx" ON "content_reviews"("updatedAt", "id");

ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "lecturer_profiles"("personId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
