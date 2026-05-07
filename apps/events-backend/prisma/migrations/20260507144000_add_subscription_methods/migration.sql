CREATE TYPE "SubscriptionCreationMethod" AS ENUM (
  'ADMIN_DASHBOARD',
  'SELF_SUBSCRIPTION',
  'UNKNOWN'
);

ALTER TABLE "event_subscriptions"
  ADD COLUMN "createdByMethod" "SubscriptionCreationMethod" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "event_group_subscriptions"
  ADD COLUMN "createdByMethod" "SubscriptionCreationMethod" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "major_event_subscriptions"
  ADD COLUMN "createdByMethod" "SubscriptionCreationMethod" NOT NULL DEFAULT 'UNKNOWN';
