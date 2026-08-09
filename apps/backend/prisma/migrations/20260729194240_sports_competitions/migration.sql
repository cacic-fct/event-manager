-- CreateEnum
CREATE TYPE "SportsTournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SportsScoringMode" AS ENUM ('PER_SPORT', 'OVERALL', 'BOTH');

-- CreateEnum
CREATE TYPE "SportsCategoryStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SportsFormat" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_ELIMINATION', 'DOUBLE_ELIMINATION', 'SWISS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SportsPreset" AS ENUM ('SOCCER', 'FUTSAL', 'TENNIS', 'BASKETBALL', 'ESPORTS', 'CHESS', 'VOLLEYBALL', 'SWIMMING', 'TABLE_TENNIS', 'HANDBALL', 'OTHER');

-- CreateEnum
CREATE TYPE "SportsTeamStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SportsParticipantStatus" AS ENUM ('PENDING', 'APPROVED', 'WAITING_PAYMENT', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SportsParticipantSource" AS ENUM ('ADMIN', 'TEAM_ASSIGNMENT', 'SELF_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SportsPaymentStatus" AS ENUM ('NOT_REQUIRED', 'NOT_AVAILABLE', 'WAITING_APPROVAL', 'WAITING_PAYMENT', 'UNDER_REVIEW', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "SportsTeamMemberStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SportsRosterRole" AS ENUM ('PLAYER', 'CAPTAIN', 'COACH');

-- CreateEnum
CREATE TYPE "SportsEligibilityStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'CHANGES_REQUESTED', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "SportsRegistrationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WAITING_PAYMENT', 'ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SportsTeamChangeRequestStatus" AS ENUM ('PENDING', 'CONFLICT', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SportsTeamChangeRequestType" AS ENUM ('TEAM_DETAILS', 'MEMBER_ADD', 'MEMBER_UPDATE', 'MEMBER_REMOVE', 'LOGO', 'REPRESENTATIVE', 'CATEGORY_ROLE', 'LINEUP');

-- CreateEnum
CREATE TYPE "SportsIdentityType" AS ENUM ('IDENTITY_DOCUMENT', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "SportsIdentityClaimStatus" AS ENUM ('PENDING', 'RESOLVED', 'NOT_FOUND', 'AMBIGUOUS', 'REJECTED');

-- CreateEnum
CREATE TYPE "SportsOfficialRole" AS ENUM ('REFEREE', 'INTERMEDIATOR', 'SCOREKEEPER');

-- CreateEnum
CREATE TYPE "SportsMatchState" AS ENUM ('SCHEDULED', 'CHECK_IN', 'LIVE', 'PAUSED', 'AWAITING_REVIEW', 'CANCELED', 'DRAW', 'FINISHED');

-- CreateEnum
CREATE TYPE "SportsReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SportsMatchActionType" AS ENUM ('CHECK_IN', 'START', 'PAUSE', 'RESUME', 'SCORE_DELTA', 'SCORE_CORRECTION', 'PERIOD_ROLL', 'FINALIZE', 'CANCEL', 'RESCHEDULE', 'FORFEIT', 'RESET');

-- CreateEnum
CREATE TYPE "SportsLossReason" AS ENUM ('SCORE', 'WALKOVER', 'FORFEIT', 'DISQUALIFICATION', 'INJURY', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "SportsRosterStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "SportsRosterEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SportsStageType" AS ENUM ('GROUP', 'ELIMINATION', 'WINNERS_BRACKET', 'LOSERS_BRACKET', 'SWISS', 'FINAL');

-- CreateEnum
CREATE TYPE "SportsBracketSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "SportsScoreEntrySource" AS ENUM ('PLACEMENT', 'MATCH', 'MANUAL', 'PENALTY');

-- CreateEnum
CREATE TYPE "SportsApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WAITING_PAYMENT', 'ACTIVE', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_TOURNAMENT';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_CATEGORY';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_TEAM';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_TEAM_MEMBER';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_REGISTRATION';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_TEAM_CHANGE_REQUEST';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_VENUE';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_MATCH';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_MATCH_ROSTER';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_MATCH_ACTION';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_OFFICIAL_ASSIGNMENT';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_PLAYER_APPLICATION';
ALTER TYPE "AuditLogEntityType" ADD VALUE 'SPORTS_TOURNAMENT_SCORE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogOperation" ADD VALUE 'SUBMIT';
ALTER TYPE "AuditLogOperation" ADD VALUE 'REQUEST_CHANGES';
ALTER TYPE "AuditLogOperation" ADD VALUE 'ASSIGN';
ALTER TYPE "AuditLogOperation" ADD VALUE 'START';
ALTER TYPE "AuditLogOperation" ADD VALUE 'PAUSE';
ALTER TYPE "AuditLogOperation" ADD VALUE 'RESUME';
ALTER TYPE "AuditLogOperation" ADD VALUE 'SCORE';
ALTER TYPE "AuditLogOperation" ADD VALUE 'FINALIZE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_PLAYER';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_CAPTAIN';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_COACH';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_REFEREE';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_INTERMEDIATOR';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_SCOREKEEPER';
ALTER TYPE "CertificateIssuedTo" ADD VALUE 'SPORTS_ORGANIZER';

-- CreateTable
CREATE TABLE "sports_tournaments" (
    "id" TEXT NOT NULL,
    "majorEventId" TEXT NOT NULL,
    "status" "SportsTournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "scoringMode" "SportsScoringMode" NOT NULL DEFAULT 'PER_SPORT',
    "selfSubscriptionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowPlayerMultipleTeams" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_categories" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "eventGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "SportsPreset" NOT NULL,
    "customSportName" TEXT,
    "division" TEXT,
    "format" "SportsFormat" NOT NULL,
    "status" "SportsCategoryStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationStartDate" TIMESTAMP(3),
    "registrationEndDate" TIMESTAMP(3),
    "minimumRosterSize" INTEGER,
    "maximumRosterSize" INTEGER,
    "maximumCaptains" INTEGER,
    "maximumCoaches" INTEGER,
    "allowPlayerMultipleTeams" BOOLEAN,
    "periodsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maximumPeriods" INTEGER,
    "periodLabel" TEXT,
    "scoreRules" JSONB NOT NULL,
    "rosterRules" JSONB NOT NULL,
    "bracketRules" JSONB NOT NULL,
    "standingsRules" JSONB NOT NULL,
    "rulesText" TEXT,
    "registrationFormId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "finishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "sports_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "status" "SportsTeamStatus" NOT NULL DEFAULT 'DRAFT',
    "logoObjectKey" TEXT,
    "logoSha256" TEXT,
    "logoMimeType" TEXT,
    "logoSizeBytes" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fieldRevisions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_tournament_participants" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" "SportsParticipantSource" NOT NULL,
    "status" "SportsParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "SportsPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "majorEventSubscriptionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_tournament_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "status" "SportsTeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_team_representatives" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_team_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_registrations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "SportsRegistrationStatus" NOT NULL DEFAULT 'DRAFT',
    "seed" INTEGER,
    "formAnswers" JSONB,
    "formSchemaSnapshot" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_registration_members" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "role" "SportsRosterRole" NOT NULL,
    "eligibility" "SportsEligibilityStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_registration_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_team_change_requests" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedByPersonId" TEXT NOT NULL,
    "type" "SportsTeamChangeRequestType" NOT NULL,
    "status" "SportsTeamChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestRevision" INTEGER NOT NULL DEFAULT 1,
    "baseRevision" INTEGER NOT NULL,
    "baseFieldRevisions" JSONB NOT NULL,
    "delta" JSONB NOT NULL,
    "pendingKey" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewMessage" TEXT,
    "resolvedDelta" JSONB,
    "resultingRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_team_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_identity_claims" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "type" "SportsIdentityType" NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "displayHint" TEXT NOT NULL,
    "status" "SportsIdentityClaimStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedPersonId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_identity_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_venues" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "placePresetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtLabel" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "parentVenueId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_stages" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SportsStageType" NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "generationRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_matches" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stageId" TEXT,
    "venueId" TEXT,
    "homeRegistrationId" TEXT,
    "awayRegistrationId" TEXT,
    "state" "SportsMatchState" NOT NULL DEFAULT 'SCHEDULED',
    "canonicalState" "SportsMatchState" NOT NULL DEFAULT 'SCHEDULED',
    "reviewStatus" "SportsReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "scoreboard" JSONB NOT NULL DEFAULT '{}',
    "canonicalScoreboard" JSONB NOT NULL DEFAULT '{}',
    "winnerRegistrationId" TEXT,
    "loserRegistrationId" TEXT,
    "lossReason" "SportsLossReason",
    "lossReasonDetail" TEXT,
    "drawWillReschedule" BOOLEAN,
    "timerStartedAt" TIMESTAMP(3),
    "timerPausedAt" TIMESTAMP(3),
    "elapsedBeforePauseMs" INTEGER NOT NULL DEFAULT 0,
    "roundNumber" INTEGER,
    "bracketPosition" INTEGER,
    "groupKey" TEXT,
    "winnerAdvancesToId" TEXT,
    "winnerAdvancesToSide" "SportsBracketSide",
    "loserAdvancesToId" TEXT,
    "loserAdvancesToSide" "SportsBracketSide",
    "replayOfMatchId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "operationSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_match_rosters" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "SportsRosterStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "copiedFromRosterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_match_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_match_roster_entries" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "registrationMemberId" TEXT NOT NULL,
    "status" "SportsRosterEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "role" "SportsRosterRole" NOT NULL DEFAULT 'PLAYER',
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_match_roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_official_assignments" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT,
    "matchId" TEXT,
    "personId" TEXT NOT NULL,
    "role" "SportsOfficialRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_official_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_match_actions" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "SportsMatchActionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "reviewStatus" "SportsReviewStatus" NOT NULL DEFAULT 'PENDING',
    "scorerRosterEntryId" TEXT,
    "actorPersonId" TEXT,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_match_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_standings" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "scoreFor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreAgainst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "tiebreakData" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_category_placements" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "sourceMatchId" TEXT,
    "placement" INTEGER NOT NULL,
    "pointsAwarded" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_category_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_tournament_score_entries" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT,
    "teamId" TEXT NOT NULL,
    "sourceMatchId" TEXT,
    "source" "SportsScoreEntrySource" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "sports_tournament_score_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_player_applications" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "applicantPersonId" TEXT NOT NULL,
    "requestedTeamId" TEXT NOT NULL,
    "status" "SportsApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "noticeAcceptedAt" TIMESTAMP(3) NOT NULL,
    "pendingKey" TEXT,
    "paymentTier" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sports_player_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_player_application_categories" (
    "applicationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_player_application_categories_pkey" PRIMARY KEY ("applicationId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_tournaments_active_majorEventId_key"
ON "sports_tournaments"("majorEventId")
WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_tournaments_status_idx" ON "sports_tournaments"("status");

-- CreateIndex
CREATE INDEX "sports_tournaments_finishedAt_idx" ON "sports_tournaments"("finishedAt");

-- CreateIndex
CREATE INDEX "sports_tournaments_deletedAt_idx" ON "sports_tournaments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sports_categories_active_eventGroupId_key"
ON "sports_categories"("eventGroupId")
WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_categories_tournamentId_status_idx" ON "sports_categories"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "sports_categories_tournamentId_sport_idx" ON "sports_categories"("tournamentId", "sport");

-- CreateIndex
CREATE INDEX "sports_categories_registrationStartDate_registrationEndDate_idx" ON "sports_categories"("registrationStartDate", "registrationEndDate");

-- CreateIndex
CREATE INDEX "sports_categories_registrationFormId_idx" ON "sports_categories"("registrationFormId");

-- CreateIndex
CREATE INDEX "sports_categories_finishedAt_idx" ON "sports_categories"("finishedAt");

-- CreateIndex
CREATE INDEX "sports_categories_deletedAt_idx" ON "sports_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_teams_tournamentId_status_idx" ON "sports_teams"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "sports_teams_tournamentId_name_idx" ON "sports_teams"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "sports_teams_deletedAt_idx" ON "sports_teams"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_tournament_participants_majorEventSubscriptionId_idx" ON "sports_tournament_participants"("majorEventSubscriptionId");

-- CreateIndex
CREATE INDEX "sports_tournament_participants_tournamentId_personId_idx" ON "sports_tournament_participants"("tournamentId", "personId");

-- Enforce one active tournament-level identity while allowing soft-deleted
-- history and any number of team memberships or category assignments.
CREATE UNIQUE INDEX "sports_tournament_participants_active_person_key"
ON "sports_tournament_participants"("tournamentId", "personId")
WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_tournament_participants_tournamentId_status_idx" ON "sports_tournament_participants"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "sports_tournament_participants_personId_idx" ON "sports_tournament_participants"("personId");

-- CreateIndex
CREATE INDEX "sports_tournament_participants_paymentStatus_idx" ON "sports_tournament_participants"("paymentStatus");

-- CreateIndex
CREATE INDEX "sports_tournament_participants_deletedAt_idx" ON "sports_tournament_participants"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_team_members_teamId_participantId_idx" ON "sports_team_members"("teamId", "participantId");

-- CreateIndex
CREATE INDEX "sports_team_members_teamId_status_idx" ON "sports_team_members"("teamId", "status");

-- CreateIndex
CREATE INDEX "sports_team_members_participantId_idx" ON "sports_team_members"("participantId");

-- CreateIndex
CREATE INDEX "sports_team_members_deletedAt_idx" ON "sports_team_members"("deletedAt");

CREATE UNIQUE INDEX "sports_team_members_active_team_participant_key" ON "sports_team_members"("teamId", "participantId") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_team_representatives_personId_active_idx" ON "sports_team_representatives"("personId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sports_team_representatives_teamId_personId_key" ON "sports_team_representatives"("teamId", "personId");

-- CreateIndex
CREATE INDEX "sports_registrations_teamId_categoryId_idx" ON "sports_registrations"("teamId", "categoryId");

-- CreateIndex
CREATE INDEX "sports_registrations_categoryId_status_idx" ON "sports_registrations"("categoryId", "status");

-- CreateIndex
CREATE INDEX "sports_registrations_teamId_idx" ON "sports_registrations"("teamId");

-- CreateIndex
CREATE INDEX "sports_registrations_seed_idx" ON "sports_registrations"("seed");

-- CreateIndex
CREATE INDEX "sports_registrations_deletedAt_idx" ON "sports_registrations"("deletedAt");

CREATE UNIQUE INDEX "sports_registrations_active_team_category_key" ON "sports_registrations"("teamId", "categoryId") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_registration_members_registrationId_teamMemberId_idx" ON "sports_registration_members"("registrationId", "teamMemberId");

-- CreateIndex
CREATE INDEX "sports_registration_members_categoryId_role_eligibility_idx" ON "sports_registration_members"("categoryId", "role", "eligibility");

-- CreateIndex
CREATE INDEX "sports_registration_members_teamMemberId_idx" ON "sports_registration_members"("teamMemberId");

-- CreateIndex
CREATE INDEX "sports_registration_members_deletedAt_idx" ON "sports_registration_members"("deletedAt");

CREATE UNIQUE INDEX "sports_registration_members_active_registration_member_key" ON "sports_registration_members"("registrationId", "teamMemberId") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sports_team_change_requests_pendingKey_key" ON "sports_team_change_requests"("pendingKey");

-- CreateIndex
CREATE INDEX "sports_team_change_requests_teamId_status_createdAt_idx" ON "sports_team_change_requests"("teamId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "sports_team_change_requests_submittedByPersonId_status_idx" ON "sports_team_change_requests"("submittedByPersonId", "status");

-- CreateIndex
CREATE INDEX "sports_identity_claims_requestId_status_idx" ON "sports_identity_claims"("requestId", "status");

-- CreateIndex
CREATE INDEX "sports_identity_claims_lookupHash_idx" ON "sports_identity_claims"("lookupHash");

-- CreateIndex
CREATE INDEX "sports_identity_claims_resolvedPersonId_idx" ON "sports_identity_claims"("resolvedPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "sports_identity_claims_requestId_clientKey_key" ON "sports_identity_claims"("requestId", "clientKey");

-- CreateIndex
CREATE INDEX "sports_venues_tournamentId_name_idx" ON "sports_venues"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "sports_venues_placePresetId_idx" ON "sports_venues"("placePresetId");

-- CreateIndex
CREATE INDEX "sports_venues_parentVenueId_idx" ON "sports_venues"("parentVenueId");

-- CreateIndex
CREATE INDEX "sports_venues_deletedAt_idx" ON "sports_venues"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_stages_categoryId_displayOrder_idx" ON "sports_stages"("categoryId", "displayOrder");

-- CreateIndex
CREATE INDEX "sports_stages_categoryId_type_idx" ON "sports_stages"("categoryId", "type");

-- CreateIndex
CREATE INDEX "sports_stages_deletedAt_idx" ON "sports_stages"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sports_matches_eventId_key" ON "sports_matches"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "sports_matches_replayOfMatchId_key" ON "sports_matches"("replayOfMatchId");

-- CreateIndex
CREATE INDEX "sports_matches_categoryId_state_idx" ON "sports_matches"("categoryId", "state");

-- CreateIndex
CREATE INDEX "sports_matches_stageId_roundNumber_bracketPosition_idx" ON "sports_matches"("stageId", "roundNumber", "bracketPosition");

-- CreateIndex
CREATE INDEX "sports_matches_venueId_idx" ON "sports_matches"("venueId");

-- CreateIndex
CREATE INDEX "sports_matches_homeRegistrationId_idx" ON "sports_matches"("homeRegistrationId");

-- CreateIndex
CREATE INDEX "sports_matches_awayRegistrationId_idx" ON "sports_matches"("awayRegistrationId");

-- CreateIndex
CREATE INDEX "sports_matches_winnerAdvancesToId_idx" ON "sports_matches"("winnerAdvancesToId");

-- CreateIndex
CREATE INDEX "sports_matches_loserAdvancesToId_idx" ON "sports_matches"("loserAdvancesToId");

-- CreateIndex
CREATE INDEX "sports_matches_replayOfMatchId_idx" ON "sports_matches"("replayOfMatchId");

-- CreateIndex
CREATE INDEX "sports_matches_reviewStatus_idx" ON "sports_matches"("reviewStatus");

-- CreateIndex
CREATE INDEX "sports_matches_deletedAt_idx" ON "sports_matches"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_match_rosters_matchId_registrationId_idx" ON "sports_match_rosters"("matchId", "registrationId");

-- CreateIndex
CREATE INDEX "sports_match_rosters_registrationId_idx" ON "sports_match_rosters"("registrationId");

-- CreateIndex
CREATE INDEX "sports_match_rosters_copiedFromRosterId_idx" ON "sports_match_rosters"("copiedFromRosterId");

-- CreateIndex
CREATE INDEX "sports_match_rosters_deletedAt_idx" ON "sports_match_rosters"("deletedAt");

CREATE UNIQUE INDEX "sports_match_rosters_active_match_registration_key" ON "sports_match_rosters"("matchId", "registrationId") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_match_roster_entries_rosterId_registrationMemberId_idx" ON "sports_match_roster_entries"("rosterId", "registrationMemberId");

-- CreateIndex
CREATE INDEX "sports_match_roster_entries_registrationMemberId_idx" ON "sports_match_roster_entries"("registrationMemberId");

-- CreateIndex
CREATE INDEX "sports_match_roster_entries_deletedAt_idx" ON "sports_match_roster_entries"("deletedAt");

CREATE UNIQUE INDEX "sports_roster_entries_active_roster_member_key" ON "sports_match_roster_entries"("rosterId", "registrationMemberId") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "sports_official_assignments_tournamentId_personId_role_idx" ON "sports_official_assignments"("tournamentId", "personId", "role");

-- CreateIndex
CREATE INDEX "sports_official_assignments_personId_active_idx" ON "sports_official_assignments"("personId", "active");

-- CreateIndex
CREATE INDEX "sports_official_assignments_categoryId_role_idx" ON "sports_official_assignments"("categoryId", "role");

-- CreateIndex
CREATE INDEX "sports_official_assignments_matchId_role_idx" ON "sports_official_assignments"("matchId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "sports_match_actions_clientId_key" ON "sports_match_actions"("clientId");

-- CreateIndex
CREATE INDEX "sports_match_actions_matchId_reviewStatus_sequence_idx" ON "sports_match_actions"("matchId", "reviewStatus", "sequence");

-- CreateIndex
CREATE INDEX "sports_match_actions_actorPersonId_idx" ON "sports_match_actions"("actorPersonId");

-- CreateIndex
CREATE INDEX "sports_match_actions_authoredAt_idx" ON "sports_match_actions"("authoredAt");

-- CreateIndex
CREATE UNIQUE INDEX "sports_match_actions_matchId_sequence_key" ON "sports_match_actions"("matchId", "sequence");

-- CreateIndex
CREATE INDEX "sports_standings_stageId_rank_idx" ON "sports_standings"("stageId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "sports_standings_stageId_registrationId_key" ON "sports_standings"("stageId", "registrationId");

-- CreateIndex
CREATE INDEX "sports_category_placements_categoryId_placement_idx" ON "sports_category_placements"("categoryId", "placement");

-- CreateIndex
CREATE INDEX "sports_category_placements_sourceMatchId_idx" ON "sports_category_placements"("sourceMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "sports_category_placements_categoryId_registrationId_key" ON "sports_category_placements"("categoryId", "registrationId");

-- CreateIndex
CREATE INDEX "sports_tournament_score_entries_tournamentId_teamId_deleted_idx" ON "sports_tournament_score_entries"("tournamentId", "teamId", "deletedAt");

-- CreateIndex
CREATE INDEX "sports_tournament_score_entries_categoryId_idx" ON "sports_tournament_score_entries"("categoryId");

-- CreateIndex
CREATE INDEX "sports_tournament_score_entries_sourceMatchId_idx" ON "sports_tournament_score_entries"("sourceMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "sports_player_applications_pendingKey_key" ON "sports_player_applications"("pendingKey");

-- CreateIndex
CREATE INDEX "sports_player_applications_tournamentId_status_idx" ON "sports_player_applications"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "sports_player_applications_applicantPersonId_status_idx" ON "sports_player_applications"("applicantPersonId", "status");

-- CreateIndex
CREATE INDEX "sports_player_applications_requestedTeamId_idx" ON "sports_player_applications"("requestedTeamId");

-- CreateIndex
CREATE INDEX "sports_player_applications_deletedAt_idx" ON "sports_player_applications"("deletedAt");

-- CreateIndex
CREATE INDEX "sports_player_application_categories_categoryId_idx" ON "sports_player_application_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "sports_tournaments" ADD CONSTRAINT "sports_tournaments_majorEventId_fkey" FOREIGN KEY ("majorEventId") REFERENCES "major_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_categories" ADD CONSTRAINT "sports_categories_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_categories" ADD CONSTRAINT "sports_categories_eventGroupId_fkey" FOREIGN KEY ("eventGroupId") REFERENCES "event_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_categories" ADD CONSTRAINT "sports_categories_registrationFormId_fkey" FOREIGN KEY ("registrationFormId") REFERENCES "event_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_teams" ADD CONSTRAINT "sports_teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_participants" ADD CONSTRAINT "sports_tournament_participants_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_participants" ADD CONSTRAINT "sports_tournament_participants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_participants" ADD CONSTRAINT "sports_tournament_participants_majorEventSubscriptionId_fkey" FOREIGN KEY ("majorEventSubscriptionId") REFERENCES "major_event_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_members" ADD CONSTRAINT "sports_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_members" ADD CONSTRAINT "sports_team_members_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "sports_tournament_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_representatives" ADD CONSTRAINT "sports_team_representatives_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_representatives" ADD CONSTRAINT "sports_team_representatives_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_registrations" ADD CONSTRAINT "sports_registrations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_registrations" ADD CONSTRAINT "sports_registrations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_registration_members" ADD CONSTRAINT "sports_registration_members_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_registration_members" ADD CONSTRAINT "sports_registration_members_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_registration_members" ADD CONSTRAINT "sports_registration_members_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "sports_team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_change_requests" ADD CONSTRAINT "sports_team_change_requests_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_team_change_requests" ADD CONSTRAINT "sports_team_change_requests_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_identity_claims" ADD CONSTRAINT "sports_identity_claims_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sports_team_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_identity_claims" ADD CONSTRAINT "sports_identity_claims_resolvedPersonId_fkey" FOREIGN KEY ("resolvedPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_venues" ADD CONSTRAINT "sports_venues_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_venues" ADD CONSTRAINT "sports_venues_placePresetId_fkey" FOREIGN KEY ("placePresetId") REFERENCES "place_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_venues" ADD CONSTRAINT "sports_venues_parentVenueId_fkey" FOREIGN KEY ("parentVenueId") REFERENCES "sports_venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_stages" ADD CONSTRAINT "sports_stages_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "sports_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "sports_venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_homeRegistrationId_fkey" FOREIGN KEY ("homeRegistrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_awayRegistrationId_fkey" FOREIGN KEY ("awayRegistrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_winnerRegistrationId_fkey" FOREIGN KEY ("winnerRegistrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_loserRegistrationId_fkey" FOREIGN KEY ("loserRegistrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_winnerAdvancesToId_fkey" FOREIGN KEY ("winnerAdvancesToId") REFERENCES "sports_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_loserAdvancesToId_fkey" FOREIGN KEY ("loserAdvancesToId") REFERENCES "sports_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_replayOfMatchId_fkey" FOREIGN KEY ("replayOfMatchId") REFERENCES "sports_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_rosters" ADD CONSTRAINT "sports_match_rosters_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "sports_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_rosters" ADD CONSTRAINT "sports_match_rosters_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_rosters" ADD CONSTRAINT "sports_match_rosters_copiedFromRosterId_fkey" FOREIGN KEY ("copiedFromRosterId") REFERENCES "sports_match_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_roster_entries" ADD CONSTRAINT "sports_match_roster_entries_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "sports_match_rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_roster_entries" ADD CONSTRAINT "sports_match_roster_entries_registrationMemberId_fkey" FOREIGN KEY ("registrationMemberId") REFERENCES "sports_registration_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_official_assignments" ADD CONSTRAINT "sports_official_assignments_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_official_assignments" ADD CONSTRAINT "sports_official_assignments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_official_assignments" ADD CONSTRAINT "sports_official_assignments_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "sports_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_official_assignments" ADD CONSTRAINT "sports_official_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_actions" ADD CONSTRAINT "sports_match_actions_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "sports_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_actions" ADD CONSTRAINT "sports_match_actions_scorerRosterEntryId_fkey" FOREIGN KEY ("scorerRosterEntryId") REFERENCES "sports_match_roster_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_match_actions" ADD CONSTRAINT "sports_match_actions_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_standings" ADD CONSTRAINT "sports_standings_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "sports_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_standings" ADD CONSTRAINT "sports_standings_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_category_placements" ADD CONSTRAINT "sports_category_placements_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_category_placements" ADD CONSTRAINT "sports_category_placements_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "sports_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_category_placements" ADD CONSTRAINT "sports_category_placements_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "sports_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_score_entries" ADD CONSTRAINT "sports_tournament_score_entries_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_score_entries" ADD CONSTRAINT "sports_tournament_score_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_score_entries" ADD CONSTRAINT "sports_tournament_score_entries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_tournament_score_entries" ADD CONSTRAINT "sports_tournament_score_entries_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "sports_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_applications" ADD CONSTRAINT "sports_player_applications_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "sports_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_applications" ADD CONSTRAINT "sports_player_applications_applicantPersonId_fkey" FOREIGN KEY ("applicantPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_applications" ADD CONSTRAINT "sports_player_applications_requestedTeamId_fkey" FOREIGN KEY ("requestedTeamId") REFERENCES "sports_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_application_categories" ADD CONSTRAINT "sports_player_application_categories_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "sports_player_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_player_application_categories" ADD CONSTRAINT "sports_player_application_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "sports_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "SportsMatchActionType" ADD VALUE IF NOT EXISTS 'TIMER_RECONCILE';
ALTER TYPE "SportsMatchActionType" ADD VALUE IF NOT EXISTS 'OCCURRENCE';

-- CreateEnum
CREATE TYPE "SportsLivestreamProvider" AS ENUM ('YOUTUBE', 'TWITCH', 'GENERAL');

-- AlterTable
ALTER TABLE "sports_tournaments"
  ADD COLUMN "selfSubscriptionAllowNoTeam" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfSubscriptionAllowNoCategory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sports_categories"
  ADD COLUMN "timerRules" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "sports_matches"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "occurrences" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "livestreamProvider" "SportsLivestreamProvider",
  ADD COLUMN "livestreamUrl" TEXT;

-- AlterTable
ALTER TABLE "sports_match_roster_entries"
  ADD COLUMN "shirtNumber" TEXT,
  ADD COLUMN "roleMetadata" JSONB;

-- AlterTable
ALTER TABLE "sports_player_applications"
  ALTER COLUMN "requestedTeamId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sports_player_applications"
  ADD COLUMN "imageLicenseAgreementAccepted" BOOLEAN NOT NULL DEFAULT false;
