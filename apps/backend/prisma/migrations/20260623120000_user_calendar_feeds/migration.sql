ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "user_calendar_feed_settings" (
    "userId" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_calendar_feed_settings_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "user_calendar_feed_settings_feedKey_key" ON "user_calendar_feed_settings"("feedKey");
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");
CREATE INDEX "user_calendar_feed_settings_enabled_idx" ON "user_calendar_feed_settings"("enabled");
CREATE INDEX "user_calendar_feed_settings_lastFetchedAt_idx" ON "user_calendar_feed_settings"("lastFetchedAt");

ALTER TABLE "user_calendar_feed_settings"
ADD CONSTRAINT "user_calendar_feed_settings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
