-- Add the category-scoped canonical shirt number used as the default for match rosters.
ALTER TABLE "sports_registration_members"
ADD COLUMN "shirtNumber" TEXT;
