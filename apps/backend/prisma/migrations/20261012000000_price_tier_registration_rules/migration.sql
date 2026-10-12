ALTER TABLE "price_tiers"
  ADD COLUMN "restrictEventSelection" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedEventIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "customizeSubscriptionLimits" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxCoursesPerAttendee" INTEGER,
  ADD COLUMN "maxLecturesPerAttendee" INTEGER,
  ADD COLUMN "maxUncategorizedPerAttendee" INTEGER;

ALTER TABLE "price_tiers"
  ADD CONSTRAINT "price_tiers_courses_limit_nonnegative" CHECK ("maxCoursesPerAttendee" >= 0),
  ADD CONSTRAINT "price_tiers_lectures_limit_nonnegative" CHECK ("maxLecturesPerAttendee" >= 0),
  ADD CONSTRAINT "price_tiers_other_limit_nonnegative" CHECK ("maxUncategorizedPerAttendee" >= 0);
