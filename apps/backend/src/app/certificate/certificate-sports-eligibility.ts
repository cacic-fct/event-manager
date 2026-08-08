import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SportsEligibilityStatus,
  SportsMatchState,
  SportsOfficialRole,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EVENT_SELECT, PERSON_SELECT } from './certificate.constants';
import type { CertificateConfigRecord, EventRecord, PersonRecord } from './certificate.constants';
import type { EligibleCertificateRecipient } from './certificate-eligibility.service';
import { sportsOfficialRoleForCertificate, sportsRosterRoleForCertificate } from './certificate-sports-roles';

type SportsCertificateTarget = {
  tournamentId: string;
  categoryId: string | null;
  matchId: string | null;
};

type SportsRecipientAccumulator = {
  person: PersonRecord;
  eventsById: Map<string, EventRecord>;
};

const EFFECTIVE_PAYMENT_STATUSES = [SportsPaymentStatus.NOT_REQUIRED, SportsPaymentStatus.PAID];
const ACCEPTED_MATCH_REVIEW_STATUSES = [SportsReviewStatus.NOT_REQUIRED, SportsReviewStatus.APPROVED];

@Injectable()
export class CertificateSportsEligibility {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(config: CertificateConfigRecord, personId?: string): Promise<EligibleCertificateRecipient[]> {
    const target = await this.resolveTarget(config);
    const rosterRole = sportsRosterRoleForCertificate(config.issuedTo as CertificateIssuedTo);
    if (rosterRole) {
      return this.resolveRosterRecipients(target, rosterRole, personId);
    }

    const officialRole = sportsOfficialRoleForCertificate(config.issuedTo as CertificateIssuedTo);
    if (officialRole) {
      return this.resolveOfficialRecipients(target, officialRole, personId);
    }

    throw new BadRequestException(`Unsupported sports certificate recipient ${config.issuedTo}.`);
  }

  private async resolveTarget(config: CertificateConfigRecord): Promise<SportsCertificateTarget> {
    if (config.scope === CertificateScope.MAJOR_EVENT) {
      if (!config.majorEventId) {
        throw new BadRequestException('Major-event sports certificate config must define majorEventId.');
      }
      const tournament = await this.prisma.sportsTournament.findFirst({
        where: {
          majorEventId: config.majorEventId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
      if (!tournament) {
        throw new BadRequestException(`Major event ${config.majorEventId} is not backed by a sports tournament.`);
      }
      return {
        tournamentId: tournament.id,
        categoryId: null,
        matchId: null,
      };
    }

    if (config.scope === CertificateScope.EVENT_GROUP) {
      if (!config.eventGroupId) {
        throw new BadRequestException('Event-group sports certificate config must define eventGroupId.');
      }
      const category = await this.prisma.sportsCategory.findFirst({
        where: {
          eventGroupId: config.eventGroupId,
          deletedAt: null,
          tournament: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          tournamentId: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
      if (!category) {
        throw new BadRequestException(`Event group ${config.eventGroupId} is not backed by a sports category.`);
      }
      return {
        tournamentId: category.tournamentId,
        categoryId: category.id,
        matchId: null,
      };
    }

    if (config.scope === CertificateScope.EVENT) {
      if (!config.eventId) {
        throw new BadRequestException('Event sports certificate config must define eventId.');
      }
      const match = await this.prisma.sportsMatch.findFirst({
        where: {
          eventId: config.eventId,
          deletedAt: null,
          canonicalState: SportsMatchState.FINISHED,
          reviewStatus: {
            in: ACCEPTED_MATCH_REVIEW_STATUSES,
          },
          category: {
            deletedAt: null,
            tournament: {
              deletedAt: null,
            },
          },
        },
        select: {
          id: true,
          categoryId: true,
          category: {
            select: {
              tournamentId: true,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      });
      if (!match) {
        throw new BadRequestException(`Event ${config.eventId} is not backed by a finalized sports match.`);
      }
      return {
        tournamentId: match.category.tournamentId,
        categoryId: match.categoryId,
        matchId: match.id,
      };
    }

    throw new BadRequestException(`Sports certificate roles do not support scope ${config.scope}.`);
  }

  private async resolveRosterRecipients(
    target: SportsCertificateTarget,
    role: SportsRosterRole,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const assignments = await this.prisma.sportsRegistrationMember.findMany({
      where: {
        role,
        eligibility: SportsEligibilityStatus.ELIGIBLE,
        deletedAt: null,
        ...(target.categoryId
          ? { categoryId: target.categoryId }
          : {
              category: {
                tournamentId: target.tournamentId,
                deletedAt: null,
              },
            }),
        registration: {
          status: {
            in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
          },
          deletedAt: null,
          team: {
            status: SportsTeamStatus.ACTIVE,
            deletedAt: null,
          },
        },
        teamMember: {
          status: SportsTeamMemberStatus.APPROVED,
          deletedAt: null,
          participant: {
            status: SportsParticipantStatus.ACTIVE,
            paymentStatus: {
              in: EFFECTIVE_PAYMENT_STATUSES,
            },
            deletedAt: null,
            ...(personId ? { personId } : {}),
            person: {
              deletedAt: null,
            },
          },
        },
        ...(target.matchId
          ? {
              rosterEntries: {
                some: {
                  status: SportsRosterEntryStatus.APPROVED,
                  deletedAt: null,
                  checkedInAt: { not: null },
                  roster: {
                    matchId: target.matchId,
                    status: SportsRosterStatus.APPROVED,
                    deletedAt: null,
                  },
                },
              },
            }
          : {}),
      },
      select: {
        categoryId: true,
        registration: {
          select: {
            id: true,
            teamId: true,
            categoryId: true,
          },
        },
        teamMember: {
          select: {
            teamId: true,
            participant: {
              select: {
                personId: true,
                person: {
                  select: PERSON_SELECT,
                },
              },
            },
          },
        },
      },
    });

    const recipientsByPerson = new Map<string, SportsRecipientAccumulator>();
    for (const assignment of assignments) {
      if (
        assignment.categoryId !== assignment.registration.categoryId ||
        assignment.teamMember.teamId !== assignment.registration.teamId
      ) {
        continue;
      }
      const { participant } = assignment.teamMember;
      recipientsByPerson.set(participant.personId, {
        person: participant.person,
        eventsById: new Map(),
      });
    }
    if (recipientsByPerson.size === 0) {
      return [];
    }

    const rosterEntries = await this.prisma.sportsMatchRosterEntry.findMany({
      where: {
        status: SportsRosterEntryStatus.APPROVED,
        deletedAt: null,
        checkedInAt: { not: null },
        registrationMember: {
          role,
          eligibility: SportsEligibilityStatus.ELIGIBLE,
          deletedAt: null,
          teamMember: {
            participant: {
              personId: {
                in: [...recipientsByPerson.keys()],
              },
            },
          },
        },
        roster: {
          status: SportsRosterStatus.APPROVED,
          deletedAt: null,
          match: {
            deletedAt: null,
            canonicalState: SportsMatchState.FINISHED,
            reviewStatus: {
              in: ACCEPTED_MATCH_REVIEW_STATUSES,
            },
            ...(target.matchId
              ? { id: target.matchId }
              : target.categoryId
                ? { categoryId: target.categoryId }
                : {
                    category: {
                      tournamentId: target.tournamentId,
                      deletedAt: null,
                    },
                  }),
          },
        },
      },
      select: {
        registrationMember: {
          select: {
            registrationId: true,
            categoryId: true,
            teamMember: {
              select: {
                participant: {
                  select: {
                    personId: true,
                  },
                },
              },
            },
          },
        },
        roster: {
          select: {
            registrationId: true,
            match: {
              select: {
                categoryId: true,
                event: {
                  select: EVENT_SELECT,
                },
              },
            },
          },
        },
      },
    });

    for (const rosterEntry of rosterEntries) {
      if (
        rosterEntry.registrationMember.registrationId !== rosterEntry.roster.registrationId ||
        rosterEntry.registrationMember.categoryId !== rosterEntry.roster.match.categoryId
      ) {
        continue;
      }
      const personKey = rosterEntry.registrationMember.teamMember.participant.personId;
      const recipient = recipientsByPerson.get(personKey);
      const event = rosterEntry.roster.match.event;
      if (recipient) {
        recipient.eventsById.set(event.id, event);
      }
    }

    for (const [personKey, recipient] of recipientsByPerson) {
      if (recipient.eventsById.size === 0) {
        recipientsByPerson.delete(personKey);
      }
    }

    return this.toRecipients(recipientsByPerson);
  }

  private async resolveOfficialRecipients(
    target: SportsCertificateTarget,
    role: SportsOfficialRole,
    personId?: string,
  ): Promise<EligibleCertificateRecipient[]> {
    const assignments = await this.prisma.sportsOfficialAssignment.findMany({
      where: {
        tournamentId: target.tournamentId,
        role,
        active: true,
        revokedAt: null,
        ...(personId ? { personId } : {}),
        person: {
          deletedAt: null,
        },
        ...(target.matchId
          ? {
              OR: [
                { matchId: target.matchId },
                { categoryId: target.categoryId, matchId: null },
                { categoryId: null, matchId: null },
              ],
            }
          : target.categoryId
            ? {
                OR: [
                  { categoryId: target.categoryId },
                  {
                    match: {
                      categoryId: target.categoryId,
                    },
                  },
                  { categoryId: null, matchId: null },
                ],
              }
            : {}),
      },
      select: {
        personId: true,
        person: {
          select: PERSON_SELECT,
        },
        categoryId: true,
        matchId: true,
        assignedAt: true,
        revokedAt: true,
      },
    });
    if (assignments.length === 0) {
      return [];
    }

    const matches = await this.prisma.sportsMatch.findMany({
      where: {
        deletedAt: null,
        canonicalState: SportsMatchState.FINISHED,
        reviewStatus: {
          in: ACCEPTED_MATCH_REVIEW_STATUSES,
        },
        ...(target.matchId
          ? { id: target.matchId }
          : target.categoryId
            ? { categoryId: target.categoryId }
            : {
                category: {
                  tournamentId: target.tournamentId,
                  deletedAt: null,
                },
              }),
      },
      select: {
        id: true,
        categoryId: true,
        event: {
          select: EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const recipientsByPerson = new Map<string, SportsRecipientAccumulator>();
    for (const assignment of assignments) {
      const recipient = recipientsByPerson.get(assignment.personId) ?? {
        person: assignment.person,
        eventsById: new Map<string, EventRecord>(),
      };
      const coveredMatches = assignment.matchId
        ? matches.filter((match) => match.id === assignment.matchId)
        : assignment.categoryId
          ? matches.filter((match) => match.categoryId === assignment.categoryId)
          : matches;
      for (const match of coveredMatches.filter(
        (match) =>
          assignment.assignedAt <= match.event.endDate &&
          (!assignment.revokedAt || assignment.revokedAt >= match.event.startDate),
      )) {
        recipient.eventsById.set(match.event.id, match.event);
      }
      recipientsByPerson.set(assignment.personId, recipient);
    }

    return this.toRecipients(recipientsByPerson);
  }

  private toRecipients(recipientsByPerson: Map<string, SportsRecipientAccumulator>): EligibleCertificateRecipient[] {
    return [...recipientsByPerson.values()].map(({ person, eventsById }) => ({
      person,
      events: [...eventsById.values()].sort(
        (left, right) => left.startDate.getTime() - right.startDate.getTime() || left.id.localeCompare(right.id),
      ),
    }));
  }
}
