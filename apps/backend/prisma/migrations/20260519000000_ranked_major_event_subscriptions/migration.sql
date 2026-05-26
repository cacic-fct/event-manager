-- Add ranked-voting metadata to major-event subscriptions.
CREATE TYPE "MajorEventSubscriptionFlow" AS ENUM ('REGULAR', 'RANKED_VOTING');

ALTER TABLE "major_events"
  ADD COLUMN "maxUncategorizedPerAttendee" INTEGER,
  ADD COLUMN "rankedSubscriptionEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "major_event_subscriptions"
  ADD COLUMN "subscriptionFlow" "MajorEventSubscriptionFlow" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN "desiredCourses" INTEGER,
  ADD COLUMN "desiredLectures" INTEGER,
  ADD COLUMN "desiredUncategorized" INTEGER;

ALTER TABLE "major_event_subscription_event_selections"
  ADD COLUMN "preferenceOrder" INTEGER;
