CREATE TABLE "user_admin_calendar_feed_settings" (
    "userId" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_admin_calendar_feed_settings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "super_admin_calendar_feed_settings" (
    "id" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admin_calendar_feed_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_admin_calendar_feed_settings_feedKey_key" ON "user_admin_calendar_feed_settings"("feedKey");
CREATE INDEX "user_admin_calendar_feed_settings_enabled_idx" ON "user_admin_calendar_feed_settings"("enabled");
CREATE INDEX "user_admin_calendar_feed_settings_lastCheckedAt_idx" ON "user_admin_calendar_feed_settings"("lastCheckedAt");
CREATE INDEX "user_admin_calendar_feed_settings_lastFetchedAt_idx" ON "user_admin_calendar_feed_settings"("lastFetchedAt");
CREATE UNIQUE INDEX "super_admin_calendar_feed_settings_feedKey_key" ON "super_admin_calendar_feed_settings"("feedKey");
CREATE INDEX "super_admin_calendar_feed_settings_enabled_idx" ON "super_admin_calendar_feed_settings"("enabled");
CREATE INDEX "super_admin_calendar_feed_settings_lastFetchedAt_idx" ON "super_admin_calendar_feed_settings"("lastFetchedAt");

ALTER TABLE "user_admin_calendar_feed_settings"
ADD CONSTRAINT "user_admin_calendar_feed_settings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
