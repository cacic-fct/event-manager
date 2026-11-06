export const subscriptionCountersFixtureSql = `
  CREATE TABLE events (
    id text PRIMARY KEY, slots integer, "queueCount" integer, "slotsAvailable" integer
  );
  CREATE TABLE event_subscriptions ("eventId" text REFERENCES events(id), "deletedAt" timestamp);
  CREATE TABLE major_event_subscriptions (
    id text PRIMARY KEY, "subscriptionStatus" text, "deletedAt" timestamp
  );
  CREATE TABLE major_event_subscription_event_selections (
    "eventId" text REFERENCES events(id),
    "subscriptionId" text REFERENCES major_event_subscriptions(id), "deletedAt" timestamp
  );
  INSERT INTO events VALUES
    ('limited', 5, 999, 999), ('unlimited', NULL, 999, 999),
    ('overbooked', 1, 999, 999), ('untouched', 8, 99, 88);
  INSERT INTO event_subscriptions VALUES
    ('limited', NULL), ('limited', NULL), ('limited', CURRENT_TIMESTAMP),
    ('unlimited', NULL), ('overbooked', NULL), ('overbooked', NULL);
  INSERT INTO major_event_subscriptions VALUES
    ('pending', 'WAITING_RECEIPT_UPLOAD', NULL),
    ('review', 'RECEIPT_UNDER_REVIEW', NULL),
    ('confirmed', 'CONFIRMED', NULL), ('canceled', 'CANCELED', NULL),
    ('deleted', 'WAITING_RECEIPT_UPLOAD', CURRENT_TIMESTAMP);
  INSERT INTO major_event_subscription_event_selections VALUES
    ('limited', 'pending', NULL), ('limited', 'review', NULL),
    ('limited', 'confirmed', NULL), ('limited', 'canceled', NULL),
    ('limited', 'deleted', NULL), ('limited', 'pending', CURRENT_TIMESTAMP),
    ('unlimited', 'pending', NULL), ('overbooked', 'review', NULL);
`;
