-- This forward-only migration replaces legacy per-user permission grants with person-first role assignments.
-- It intentionally leaves historical audit entries intact while removing the legacy grant table and enum.

CREATE TYPE "EventManagerPermissionScope" AS ENUM ('GLOBAL', 'EVENT', 'MAJOR_EVENT', 'EVENT_GROUP');
CREATE TYPE "EventManagerPermissionArchiveReason" AS ENUM (
  'MANUAL',
  'EXPIRED',
  'MIGRATED',
  'ROLE_ARCHIVED',
  'GROUP_ARCHIVED',
  'PERSON_MERGED'
);

ALTER TYPE "AuditLogEntityType" ADD VALUE IF NOT EXISTS 'PERMISSION_ROLE';
ALTER TYPE "AuditLogEntityType" ADD VALUE IF NOT EXISTS 'PERMISSION_GROUP';

ALTER TABLE "event_groups" ADD COLUMN "majorEventId" TEXT;

UPDATE "event_groups" AS event_group
SET "majorEventId" = candidate."majorEventId"
FROM (
  SELECT "eventGroupId", MIN("majorEventId") AS "majorEventId"
  FROM "events"
  WHERE "deletedAt" IS NULL
    AND "eventGroupId" IS NOT NULL
    AND "majorEventId" IS NOT NULL
  GROUP BY "eventGroupId"
) AS candidate
WHERE event_group."id" = candidate."eventGroupId";

UPDATE "events" AS event
SET "majorEventId" = event_group."majorEventId"
FROM "event_groups" AS event_group
WHERE event."eventGroupId" = event_group."id"
  AND event."deletedAt" IS NULL
  AND event."majorEventId" IS DISTINCT FROM event_group."majorEventId";

CREATE INDEX "event_groups_majorEventId_idx" ON "event_groups"("majorEventId");
ALTER TABLE "event_groups"
  ADD CONSTRAINT "event_groups_majorEventId_fkey"
  FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_manager_roles" (
  "id" TEXT NOT NULL,
  "systemKey" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '🔐',
  "position" INTEGER NOT NULL DEFAULT 0,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "event_manager_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_roles_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "event_manager_roles_systemKey_key" ON "event_manager_roles"("systemKey");
CREATE INDEX "event_manager_roles_name_idx" ON "event_manager_roles"("name");
CREATE INDEX "event_manager_roles_position_idx" ON "event_manager_roles"("position");
CREATE INDEX "event_manager_roles_isSystem_idx" ON "event_manager_roles"("isSystem");
CREATE INDEX "event_manager_roles_archivedAt_idx" ON "event_manager_roles"("archivedAt");
CREATE UNIQUE INDEX "event_manager_roles_name_active_key"
  ON "event_manager_roles"(LOWER("name")) WHERE "archivedAt" IS NULL;

CREATE TABLE "event_manager_role_permissions" (
  "roleId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "event_manager_role_permissions_pkey" PRIMARY KEY ("roleId", "permission"),
  CONSTRAINT "event_manager_role_permissions_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "event_manager_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "event_manager_role_permissions_permission_idx" ON "event_manager_role_permissions"("permission");

CREATE TABLE "event_manager_role_inheritances" (
  "id" TEXT NOT NULL,
  "childRoleId" TEXT NOT NULL,
  "parentRoleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "event_manager_role_inheritances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_role_inheritances_distinct_roles_check" CHECK ("childRoleId" <> "parentRoleId"),
  CONSTRAINT "event_manager_role_inheritances_childRoleId_fkey"
    FOREIGN KEY ("childRoleId") REFERENCES "event_manager_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_inheritances_parentRoleId_fkey"
    FOREIGN KEY ("parentRoleId") REFERENCES "event_manager_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_manager_role_inheritances_active_key"
  ON "event_manager_role_inheritances"("childRoleId", "parentRoleId") WHERE "archivedAt" IS NULL;
CREATE INDEX "event_manager_role_inheritances_childRoleId_idx" ON "event_manager_role_inheritances"("childRoleId");
CREATE INDEX "event_manager_role_inheritances_parentRoleId_idx" ON "event_manager_role_inheritances"("parentRoleId");
CREATE INDEX "event_manager_role_inheritances_archivedAt_idx" ON "event_manager_role_inheritances"("archivedAt");

CREATE TABLE "event_manager_permission_groups" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '👥',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "event_manager_permission_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_permission_groups_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "event_manager_permission_groups_name_active_key"
  ON "event_manager_permission_groups"(LOWER("name")) WHERE "archivedAt" IS NULL;
CREATE INDEX "event_manager_permission_groups_name_idx" ON "event_manager_permission_groups"("name");
CREATE INDEX "event_manager_permission_groups_archivedAt_idx" ON "event_manager_permission_groups"("archivedAt");

CREATE TABLE "event_manager_role_assignments" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "personId" TEXT,
  "groupId" TEXT,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" "EventManagerPermissionArchiveReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "event_manager_role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_role_assignments_subject_check"
    CHECK (("personId" IS NOT NULL)::int + ("groupId" IS NOT NULL)::int = 1),
  CONSTRAINT "event_manager_role_assignments_validity_check"
    CHECK (("unlimited" AND "validUntil" IS NULL) OR (NOT "unlimited" AND "validUntil" IS NOT NULL)),
  CONSTRAINT "event_manager_role_assignments_validity_window_check"
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil"),
  CONSTRAINT "event_manager_role_assignments_archive_reason_check"
    CHECK (("archivedAt" IS NULL) = ("archivedReason" IS NULL)),
  CONSTRAINT "event_manager_role_assignments_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "event_manager_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_assignments_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_assignments_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "event_manager_permission_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_manager_role_assignments_person_active_key"
  ON "event_manager_role_assignments"("roleId", "personId")
  WHERE "archivedAt" IS NULL AND "personId" IS NOT NULL;
CREATE UNIQUE INDEX "event_manager_role_assignments_group_active_key"
  ON "event_manager_role_assignments"("roleId", "groupId")
  WHERE "archivedAt" IS NULL AND "groupId" IS NOT NULL;
CREATE INDEX "event_manager_role_assignments_roleId_idx" ON "event_manager_role_assignments"("roleId");
CREATE INDEX "event_manager_role_assignments_personId_idx" ON "event_manager_role_assignments"("personId");
CREATE INDEX "event_manager_role_assignments_groupId_idx" ON "event_manager_role_assignments"("groupId");
CREATE INDEX "event_manager_role_assignments_validFrom_idx" ON "event_manager_role_assignments"("validFrom");
CREATE INDEX "event_manager_role_assignments_validUntil_idx" ON "event_manager_role_assignments"("validUntil");
CREATE INDEX "event_manager_role_assignments_archivedAt_idx" ON "event_manager_role_assignments"("archivedAt");

CREATE TABLE "event_manager_role_assignment_scopes" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "scope" "EventManagerPermissionScope" NOT NULL,
  "eventId" TEXT,
  "majorEventId" TEXT,
  "eventGroupId" TEXT,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" "EventManagerPermissionArchiveReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "event_manager_role_assignment_scopes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_role_assignment_scopes_target_check" CHECK (
    ("scope" = 'GLOBAL' AND "eventId" IS NULL AND "majorEventId" IS NULL AND "eventGroupId" IS NULL)
    OR ("scope" = 'EVENT' AND "eventId" IS NOT NULL AND "majorEventId" IS NULL AND "eventGroupId" IS NULL)
    OR ("scope" = 'MAJOR_EVENT' AND "eventId" IS NULL AND "majorEventId" IS NOT NULL AND "eventGroupId" IS NULL)
    OR ("scope" = 'EVENT_GROUP' AND "eventId" IS NULL AND "majorEventId" IS NULL AND "eventGroupId" IS NOT NULL)
  ),
  CONSTRAINT "event_manager_role_assignment_scopes_validity_check"
    CHECK (("unlimited" AND "validUntil" IS NULL) OR (NOT "unlimited" AND "validUntil" IS NOT NULL)),
  CONSTRAINT "event_manager_role_assignment_scopes_validity_window_check"
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil"),
  CONSTRAINT "event_manager_role_assignment_scopes_archive_reason_check"
    CHECK (("archivedAt" IS NULL) = ("archivedReason" IS NULL)),
  CONSTRAINT "event_manager_role_assignment_scopes_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "event_manager_role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_assignment_scopes_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_assignment_scopes_majorEventId_fkey"
    FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_manager_role_assignment_scopes_eventGroupId_fkey"
    FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_global_active_key"
  ON "event_manager_role_assignment_scopes"("assignmentId")
  WHERE "archivedAt" IS NULL AND "scope" = 'GLOBAL';
CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_event_active_key"
  ON "event_manager_role_assignment_scopes"("assignmentId", "eventId")
  WHERE "archivedAt" IS NULL AND "scope" = 'EVENT';
CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_major_event_active_key"
  ON "event_manager_role_assignment_scopes"("assignmentId", "majorEventId")
  WHERE "archivedAt" IS NULL AND "scope" = 'MAJOR_EVENT';
CREATE UNIQUE INDEX "event_manager_role_assignment_scopes_event_group_active_key"
  ON "event_manager_role_assignment_scopes"("assignmentId", "eventGroupId")
  WHERE "archivedAt" IS NULL AND "scope" = 'EVENT_GROUP';
CREATE INDEX "event_manager_role_assignment_scopes_assignmentId_idx" ON "event_manager_role_assignment_scopes"("assignmentId");
CREATE INDEX "event_manager_role_assignment_scopes_scope_idx" ON "event_manager_role_assignment_scopes"("scope");
CREATE INDEX "event_manager_role_assignment_scopes_eventId_idx" ON "event_manager_role_assignment_scopes"("eventId");
CREATE INDEX "event_manager_role_assignment_scopes_majorEventId_idx" ON "event_manager_role_assignment_scopes"("majorEventId");
CREATE INDEX "event_manager_role_assignment_scopes_eventGroupId_idx" ON "event_manager_role_assignment_scopes"("eventGroupId");
CREATE INDEX "event_manager_role_assignment_scopes_validFrom_idx" ON "event_manager_role_assignment_scopes"("validFrom");
CREATE INDEX "event_manager_role_assignment_scopes_validUntil_idx" ON "event_manager_role_assignment_scopes"("validUntil");
CREATE INDEX "event_manager_role_assignment_scopes_archivedAt_idx" ON "event_manager_role_assignment_scopes"("archivedAt");

CREATE TABLE "event_manager_permission_group_members" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "unlimited" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "archivedReason" "EventManagerPermissionArchiveReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "event_manager_permission_group_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_manager_permission_group_members_validity_check"
    CHECK (("unlimited" AND "validUntil" IS NULL) OR (NOT "unlimited" AND "validUntil" IS NOT NULL)),
  CONSTRAINT "event_manager_permission_group_members_validity_window_check"
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil"),
  CONSTRAINT "event_manager_permission_group_members_archive_reason_check"
    CHECK (("archivedAt" IS NULL) = ("archivedReason" IS NULL)),
  CONSTRAINT "event_manager_permission_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "event_manager_permission_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_manager_permission_group_members_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_manager_permission_group_members_active_key"
  ON "event_manager_permission_group_members"("groupId", "personId") WHERE "archivedAt" IS NULL;
CREATE INDEX "event_manager_permission_group_members_groupId_idx" ON "event_manager_permission_group_members"("groupId");
CREATE INDEX "event_manager_permission_group_members_personId_idx" ON "event_manager_permission_group_members"("personId");
CREATE INDEX "event_manager_permission_group_members_validFrom_idx" ON "event_manager_permission_group_members"("validFrom");
CREATE INDEX "event_manager_permission_group_members_validUntil_idx" ON "event_manager_permission_group_members"("validUntil");
CREATE INDEX "event_manager_permission_group_members_archivedAt_idx" ON "event_manager_permission_group_members"("archivedAt");

INSERT INTO "event_manager_roles" (
  "id", "systemKey", "name", "description", "emoji", "position", "isSystem", "updatedAt"
) VALUES
  ('00000000-0000-7000-8000-000000000002', 'platform-admin', 'Administrador da plataforma', 'Definição administrada pelo código.', '🔐', 10, true, CURRENT_TIMESTAMP),
  ('00000000-0000-7000-8000-000000000003', 'major-event-manager', 'Gestor de grande evento', 'Definição administrada pelo código.', '🎪', 20, true, CURRENT_TIMESTAMP),
  ('00000000-0000-7000-8000-000000000004', 'operations-coordinator', 'Coordenação operacional', 'Definição administrada pelo código.', '🧭', 30, true, CURRENT_TIMESTAMP),
  ('00000000-0000-7000-8000-000000000005', 'attendance-coordinator', 'Equipe de presenças', 'Definição administrada pelo código.', '✅', 40, true, CURRENT_TIMESTAMP),
  ('00000000-0000-7000-8000-000000000006', 'sports-coordinator', 'Coordenação esportiva', 'Definição administrada pelo código.', '🏆', 50, true, CURRENT_TIMESTAMP);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "event_manager_permission_grants" grant_record
    LEFT JOIN "people" person ON person."id" = grant_record."personId"
    WHERE grant_record."personId" IS NOT NULL
      AND (person."id" IS NULL OR person."userId" IS DISTINCT FROM grant_record."userId")
  ) THEN
    RAISE EXCEPTION 'Cannot migrate permissions: a grant references a person not linked to its user.';
  END IF;

  IF EXISTS (
    SELECT grant_record."userId"
    FROM "event_manager_permission_grants" grant_record
    JOIN "people" person ON person."userId" = grant_record."userId" AND person."deletedAt" IS NULL
    WHERE grant_record."personId" IS NULL
    GROUP BY grant_record."userId"
    HAVING COUNT(DISTINCT person."id") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate permissions: a user is linked to multiple active people records.';
  END IF;
END $$;

INSERT INTO "people" (
  "id", "name", "email", "secondaryEmails", "userId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, app_user."name", app_user."email", ARRAY[]::TEXT[], app_user."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" app_user
WHERE EXISTS (
  SELECT 1 FROM "event_manager_permission_grants" grant_record
  WHERE grant_record."userId" = app_user."id" AND grant_record."personId" IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM "people" person
  WHERE person."userId" = app_user."id" AND person."deletedAt" IS NULL
);

CREATE TEMPORARY TABLE "_permission_migration_groups" AS
SELECT
  gen_random_uuid()::text AS "roleId",
  gen_random_uuid()::text AS "assignmentId",
  gen_random_uuid()::text AS "scopeId",
  grant_record."userId",
  COALESCE(grant_record."personId", MIN(person."id")) AS "personId",
  grant_record."scope"::text AS "scope",
  grant_record."eventId",
  grant_record."majorEventId",
  grant_record."eventGroupId",
  grant_record."validFrom",
  grant_record."validUntil",
  grant_record."deletedAt",
  MIN(grant_record."createdAt") AS "createdAt",
  MIN(grant_record."createdById") AS "createdById",
  MAX(grant_record."updatedAt") AS "updatedAt",
  MAX(grant_record."updatedById") AS "updatedById"
FROM "event_manager_permission_grants" grant_record
JOIN "people" person
  ON person."id" = grant_record."personId"
  OR (grant_record."personId" IS NULL AND person."userId" = grant_record."userId" AND person."deletedAt" IS NULL)
GROUP BY
  grant_record."userId",
  grant_record."personId",
  grant_record."scope",
  grant_record."eventId",
  grant_record."majorEventId",
  grant_record."eventGroupId",
  grant_record."validFrom",
  grant_record."validUntil",
  grant_record."deletedAt";

INSERT INTO "event_manager_roles" (
  "id", "name", "description", "emoji", "position", "isSystem", "archivedAt",
  "createdAt", "createdById", "updatedAt", "updatedById"
)
SELECT
  migration_group."roleId",
  'Acesso migrado · ' || app_user."name" || ' · ' || migration_group."scope" || ' · ' || LEFT(migration_group."roleId", 8),
  'Cargo criado automaticamente a partir das concessões anteriores. Revise e renomeie quando apropriado.',
  '📦',
  1000,
  false,
  CASE
    WHEN migration_group."deletedAt" IS NOT NULL THEN migration_group."deletedAt"
    WHEN migration_group."validUntil" <= CURRENT_TIMESTAMP THEN migration_group."validUntil"
    ELSE NULL
  END,
  migration_group."createdAt",
  migration_group."createdById",
  migration_group."updatedAt",
  migration_group."updatedById"
FROM "_permission_migration_groups" migration_group
JOIN "users" app_user ON app_user."id" = migration_group."userId";

INSERT INTO "event_manager_role_permissions" ("roleId", "permission", "createdAt", "createdById")
SELECT DISTINCT
  migration_group."roleId",
  grant_record."permission",
  grant_record."createdAt",
  grant_record."createdById"
FROM "_permission_migration_groups" migration_group
JOIN "event_manager_permission_grants" grant_record
  ON grant_record."userId" = migration_group."userId"
  AND grant_record."scope"::text = migration_group."scope"
  AND grant_record."eventId" IS NOT DISTINCT FROM migration_group."eventId"
  AND grant_record."majorEventId" IS NOT DISTINCT FROM migration_group."majorEventId"
  AND grant_record."eventGroupId" IS NOT DISTINCT FROM migration_group."eventGroupId"
  AND grant_record."validFrom" IS NOT DISTINCT FROM migration_group."validFrom"
  AND grant_record."validUntil" IS NOT DISTINCT FROM migration_group."validUntil"
  AND grant_record."deletedAt" IS NOT DISTINCT FROM migration_group."deletedAt";

INSERT INTO "event_manager_role_assignments" (
  "id", "roleId", "personId", "validFrom", "validUntil", "unlimited", "archivedAt", "archivedReason",
  "createdAt", "createdById", "updatedAt", "updatedById"
)
SELECT
  "assignmentId", "roleId", "personId", "validFrom", "validUntil", "validUntil" IS NULL,
  CASE WHEN "deletedAt" IS NOT NULL THEN "deletedAt" WHEN "validUntil" <= CURRENT_TIMESTAMP THEN "validUntil" END,
  CASE
    WHEN "deletedAt" IS NOT NULL THEN 'MIGRATED'::"EventManagerPermissionArchiveReason"
    WHEN "validUntil" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"EventManagerPermissionArchiveReason"
  END,
  "createdAt", "createdById", "updatedAt", "updatedById"
FROM "_permission_migration_groups";

INSERT INTO "event_manager_role_assignment_scopes" (
  "id", "assignmentId", "scope", "eventId", "majorEventId", "eventGroupId",
  "validFrom", "validUntil", "unlimited", "archivedAt", "archivedReason",
  "createdAt", "createdById", "updatedAt", "updatedById"
)
SELECT
  "scopeId", "assignmentId", "scope"::"EventManagerPermissionScope", "eventId", "majorEventId", "eventGroupId",
  "validFrom", "validUntil", "validUntil" IS NULL,
  CASE WHEN "deletedAt" IS NOT NULL THEN "deletedAt" WHEN "validUntil" <= CURRENT_TIMESTAMP THEN "validUntil" END,
  CASE
    WHEN "deletedAt" IS NOT NULL THEN 'MIGRATED'::"EventManagerPermissionArchiveReason"
    WHEN "validUntil" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"EventManagerPermissionArchiveReason"
  END,
  "createdAt", "createdById", "updatedAt", "updatedById"
FROM "_permission_migration_groups";

DROP TABLE "event_manager_permission_grants";
DROP TYPE "EventManagerPermissionGrantScope";

CREATE OR REPLACE FUNCTION "assert_event_group_major_event_consistency"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  configured_major_event_id TEXT;
BEGIN
  IF NEW."eventGroupId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "majorEventId" INTO configured_major_event_id
  FROM "event_groups"
  WHERE "id" = NEW."eventGroupId";

  IF configured_major_event_id IS NOT NULL AND NEW."majorEventId" IS DISTINCT FROM configured_major_event_id THEN
    RAISE EXCEPTION 'Event majorEventId must match its event group majorEventId.';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "events_event_group_major_event_consistency"
BEFORE INSERT OR UPDATE OF "eventGroupId", "majorEventId" ON "events"
FOR EACH ROW EXECUTE FUNCTION "assert_event_group_major_event_consistency"();
