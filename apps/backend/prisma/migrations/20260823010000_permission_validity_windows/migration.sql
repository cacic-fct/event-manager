DROP INDEX IF EXISTS "event_manager_role_assignments_person_active_key";
DROP INDEX IF EXISTS "event_manager_role_assignments_group_active_key";
DROP INDEX IF EXISTS "event_manager_role_assignment_scopes_global_active_key";
DROP INDEX IF EXISTS "event_manager_role_assignment_scopes_event_active_key";
DROP INDEX IF EXISTS "event_manager_role_assignment_scopes_major_event_active_key";
DROP INDEX IF EXISTS "event_manager_role_assignment_scopes_event_group_active_key";
DROP INDEX IF EXISTS "event_manager_permission_group_members_active_key";

CREATE UNIQUE INDEX "event_manager_role_assignments_person_active_window_key"
ON "event_manager_role_assignments" (
  "roleId",
  "personId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "personId" IS NOT NULL;

CREATE UNIQUE INDEX "event_manager_role_assignments_group_active_window_key"
ON "event_manager_role_assignments" (
  "roleId",
  "groupId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "groupId" IS NOT NULL;

CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_global_active_window_key"
ON "event_manager_role_assignment_scopes" (
  "assignmentId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "scope" = 'GLOBAL';

CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_event_active_window_key"
ON "event_manager_role_assignment_scopes" (
  "assignmentId",
  "eventId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "scope" = 'EVENT';

CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_major_event_active_window_key"
ON "event_manager_role_assignment_scopes" (
  "assignmentId",
  "majorEventId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "scope" = 'MAJOR_EVENT';

CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_event_group_active_window_key"
ON "event_manager_role_assignment_scopes" (
  "assignmentId",
  "eventGroupId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL AND "scope" = 'EVENT_GROUP';

CREATE UNIQUE INDEX "event_manager_permission_group_members_active_window_key"
ON "event_manager_permission_group_members" (
  "groupId",
  "personId",
  COALESCE("validFrom", '-infinity'::timestamp),
  COALESCE("validUntil", 'infinity'::timestamp)
)
WHERE "archivedAt" IS NULL;
