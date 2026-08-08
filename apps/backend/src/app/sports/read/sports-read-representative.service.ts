import { NotFoundException } from '@nestjs/common';
import { Prisma, SportsApplicationStatus, SportsTeamChangeRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsReadAdminMapper } from './sports-read-admin.mapper';
import type { RepresentativeSportsTeamWorkspace } from './sports-read.models';
import { PUBLIC_TEAM_SELECT } from './sports-read.records';
import { SportsReadPublicService } from './sports-read-public.service';

export class SportsReadRepresentativeService {
  private readonly mapper = new SportsReadAdminMapper();

  constructor(
    private readonly prisma: PrismaService,
    private readonly publicReader: SportsReadPublicService,
  ) {}

  async representativeTeamWorkspace(
    teamId: string,
    representativePersonId: string,
  ): Promise<RepresentativeSportsTeamWorkspace> {
    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: teamId,
        deletedAt: null,
        representatives: {
          some: {
            personId: representativePersonId,
            active: true,
            revokedAt: null,
          },
        },
      },
      select: {
        ...PUBLIC_TEAM_SELECT,
        revision: true,
        changeRequests: {
          where: {
            submittedByPersonId: representativePersonId,
            status: {
              in: [
                SportsTeamChangeRequestStatus.PENDING,
                SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
                SportsTeamChangeRequestStatus.CONFLICT,
              ],
            },
          },
          select: {
            id: true,
            type: true,
            status: true,
            requestRevision: true,
            baseRevision: true,
            delta: true,
            reviewMessage: true,
            updatedAt: true,
            identityClaims: {
              select: {
                clientKey: true,
                type: true,
                displayHint: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!team) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    const [members, registrations, matches, joinQueue] = await Promise.all([
      this.prisma.sportsTeamMember.findMany({
        where: { teamId, deletedAt: null },
        select: {
          id: true,
          status: true,
          revision: true,
          participant: {
            select: {
              person: { select: { name: true } },
            },
          },
          categoryAssignments: {
            where: { deletedAt: null },
            select: {
              registrationId: true,
              categoryId: true,
              role: true,
              eligibility: true,
              category: { select: { name: true } },
            },
            orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsRegistration.findMany({
        where: { teamId, deletedAt: null },
        select: {
          id: true,
          categoryId: true,
          status: true,
          category: {
            select: {
              name: true,
              eventGroup: { select: { emoji: true } },
            },
          },
        },
        orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.sportsMatch.findMany({
        where: {
          deletedAt: null,
          OR: [{ homeRegistration: { teamId, deletedAt: null } }, { awayRegistration: { teamId, deletedAt: null } }],
        },
        select: {
          id: true,
          eventId: true,
          state: true,
          categoryId: true,
          category: { select: { name: true, eventGroup: { select: { emoji: true } } } },
          homeRegistrationId: true,
          awayRegistrationId: true,
          homeRegistration: { select: { team: { select: PUBLIC_TEAM_SELECT } } },
          awayRegistration: { select: { team: { select: PUBLIC_TEAM_SELECT } } },
          event: {
            select: { startDate: true, endDate: true },
          },
        },
        orderBy: [{ event: { startDate: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.sportsPlayerApplication.findMany({
        where: {
          requestedTeamId: teamId,
          status: SportsApplicationStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          applicantPerson: {
            select: {
              name: true,
              identityDocument: true,
            },
          },
          categoryChoices: {
            select: {
              category: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      team: {
        id: team.id,
        name: team.name,
        institution: team.institution,
        logoUrl: team.logoSha256 ? `/api/sports/teams/${team.id}/logo/${team.logoSha256}` : null,
      },
      teamRevision: team.revision,
      queuedChanges: team.changeRequests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        requestRevision: request.requestRevision,
        baseRevision: request.baseRevision,
        deltaJson: this.serializeRepresentativeDelta(request.delta),
        reviewMessage: request.reviewMessage,
        identityHints: request.identityClaims,
        updatedAt: request.updatedAt,
      })),
      members: members.map((member) => ({
        id: member.id,
        name: member.participant.person.name,
        status: member.status,
        revision: member.revision,
        categoryRoles: member.categoryAssignments.map((assignment) => ({
          registrationId: assignment.registrationId,
          categoryId: assignment.categoryId,
          categoryName: assignment.category.name,
          role: assignment.role,
          eligibility: assignment.eligibility,
        })),
      })),
      registrations: registrations.map((registration) => ({
        id: registration.id,
        categoryId: registration.categoryId,
        categoryName: registration.category.name,
        categoryEmoji: registration.category.eventGroup.emoji || '🏅',
        status: registration.status,
      })),
      matches: matches.map((match) => ({
        id: match.id,
        eventId: match.eventId,
        state: match.state,
        startDate: match.event.startDate,
        endDate: match.event.endDate,
        homeRegistrationId: match.homeRegistrationId,
        awayRegistrationId: match.awayRegistrationId,
        categoryId: match.categoryId,
        categoryName: match.category.name,
        categoryEmoji: match.category.eventGroup.emoji || '🏅',
        homeTeam: match.homeRegistration ? this.publicReader.mapPublicTeam(match.homeRegistration.team) : null,
        awayTeam: match.awayRegistration ? this.publicReader.mapPublicTeam(match.awayRegistration.team) : null,
      })),
      joinQueue: joinQueue.map((application) => ({
        id: application.id,
        applicantName: application.applicantPerson.name,
        identityDocumentHint: this.mapper.censorIdentityDocument(application.applicantPerson.identityDocument),
        categoryNames: application.categoryChoices.map((choice) => choice.category.name),
        status: application.status,
      })),
    };
  }

  private serializeRepresentativeDelta(value: Prisma.JsonValue): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return '{}';
    }
    const record = value as Record<string, unknown>;
    const logo =
      record['logo'] && typeof record['logo'] === 'object' && !Array.isArray(record['logo'])
        ? (record['logo'] as Record<string, unknown>)
        : undefined;
    return JSON.stringify({
      ...(record['set'] !== undefined ? { set: record['set'] } : {}),
      ...(record['categoryIds'] !== undefined ? { categoryIds: record['categoryIds'] } : {}),
      ...(record['memberChanges'] !== undefined ? { memberChanges: record['memberChanges'] } : {}),
      ...(record['categoryRoleChanges'] !== undefined ? { categoryRoleChanges: record['categoryRoleChanges'] } : {}),
      ...(logo
        ? {
            logo: {
              sha256: logo['sha256'],
              mimeType: logo['mimeType'],
              sizeBytes: logo['sizeBytes'],
            },
          }
        : {}),
    });
  }
}
