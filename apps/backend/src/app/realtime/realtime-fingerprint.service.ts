import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

interface AggregateFingerprint {
  _count: number;
  _max: object;
}

export interface CurrentUserRealtimeFingerprint {
  type: 'CURRENT_USER_DATA_INVALIDATED';
  minute: number;
  attendances: AggregateFingerprint;
  eventSubscriptions: AggregateFingerprint;
  eventSubscriptionGroups: string;
  eventGroupSubscriptions: AggregateFingerprint;
  majorEventSubscriptions: AggregateFingerprint;
  certificates: AggregateFingerprint;
  applications: AggregateFingerprint;
  participants: AggregateFingerprint;
  lecturers: AggregateFingerprint;
  attendanceCollectors: AggregateFingerprint;
  teamRepresentatives: AggregateFingerprint;
  officialAssignments: AggregateFingerprint;
  teamMemberships: AggregateFingerprint;
  registrationMemberships: AggregateFingerprint;
  rosterEntries: AggregateFingerprint;
  roleAssignments: AggregateFingerprint;
  roleAssignmentScopes: AggregateFingerprint;
  permissionGroupMemberships: AggregateFingerprint;
}

export interface EventSubscriptionsRealtimeFingerprint {
  type: 'EVENT_SUBSCRIPTIONS_INVALIDATED';
  subscriptions: AggregateFingerprint;
  subscriptionGroups: string;
  lecturers: AggregateFingerprint;
  selections: AggregateFingerprint;
  rankedSubscriptions: AggregateFingerprint;
}

export interface MajorEventSubscriptionsRealtimeFingerprint {
  type: 'MAJOR_EVENT_SUBSCRIPTIONS_INVALIDATED';
  subscriptions: AggregateFingerprint;
  selections: AggregateFingerprint;
  receipts: AggregateFingerprint;
  applications: AggregateFingerprint;
  participants: AggregateFingerprint;
  teams: AggregateFingerprint;
  members: AggregateFingerprint;
  registrationMembers: AggregateFingerprint;
}

@Injectable()
export class RealtimeFingerprintService {
  constructor(private readonly prisma: PrismaService) {}

  async currentUser(personId: string): Promise<CurrentUserRealtimeFingerprint> {
    const [
      attendances,
      eventSubscriptions,
      eventSubscriptionGroups,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      certificates,
      applications,
      participants,
      lecturers,
      attendanceCollectors,
      teamRepresentatives,
      officialAssignments,
      teamMemberships,
      registrationMemberships,
      rosterEntries,
      roleAssignments,
      roleAssignmentScopes,
      permissionGroupMemberships,
    ] = await Promise.all([
        this.prisma.eventAttendance.aggregate({
          where: { personId },
          _count: true,
          _max: { createdAt: true, attendedAt: true },
        }),
        this.prisma.eventSubscription.aggregate({
          where: { personId },
          _count: true,
          _max: { createdAt: true, deletedAt: true },
        }),
        this.eventSubscriptionGroupFingerprint({ personId }),
        this.prisma.eventGroupSubscription.aggregate({
          where: { personId },
          _count: true,
          _max: { createdAt: true, deletedAt: true },
        }),
        this.prisma.majorEventSubscription.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.certificate.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.sportsPlayerApplication.aggregate({
          where: { applicantPersonId: personId },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.sportsTournamentParticipant.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.eventLecturer.aggregate({
          where: { personId },
          _count: true,
          _max: { createdAt: true },
        }),
        this.prisma.eventAttendanceCollector.aggregate({
          where: { personId },
          _count: true,
          _max: { createdAt: true },
        }),
        this.prisma.sportsTeamRepresentative.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, revokedAt: true },
        }),
        this.prisma.sportsOfficialAssignment.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, revokedAt: true },
        }),
        this.prisma.sportsTeamMember.aggregate({
          where: { participant: { personId } },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.sportsRegistrationMember.aggregate({
          where: { teamMember: { participant: { personId } } },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.sportsMatchRosterEntry.aggregate({
          where: { registrationMember: { teamMember: { participant: { personId } } } },
          _count: true,
          _max: { updatedAt: true, deletedAt: true },
        }),
        this.prisma.eventManagerRoleAssignment.aggregate({
          where: {
            OR: [{ personId }, { group: { members: { some: { personId } } } }],
          },
          _count: true,
          _max: { updatedAt: true, validFrom: true, validUntil: true, archivedAt: true },
        }),
        this.prisma.eventManagerRoleAssignmentScope.aggregate({
          where: {
            assignment: {
              OR: [{ personId }, { group: { members: { some: { personId } } } }],
            },
          },
          _count: true,
          _max: { updatedAt: true, validFrom: true, validUntil: true, archivedAt: true },
        }),
        this.prisma.eventManagerPermissionGroupMember.aggregate({
          where: { personId },
          _count: true,
          _max: { updatedAt: true, validFrom: true, validUntil: true, archivedAt: true },
        }),
      ]);

    return {
      type: 'CURRENT_USER_DATA_INVALIDATED',
      minute: Math.floor(Date.now() / 60_000),
      attendances,
      eventSubscriptions,
      eventSubscriptionGroups,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      certificates,
      applications,
      participants,
      lecturers,
      attendanceCollectors,
      teamRepresentatives,
      officialAssignments,
      teamMemberships,
      registrationMemberships,
      rosterEntries,
      roleAssignments,
      roleAssignmentScopes,
      permissionGroupMemberships,
    };
  }

  async eventSubscriptions(eventId: string): Promise<EventSubscriptionsRealtimeFingerprint> {
    const [subscriptions, subscriptionGroups, lecturers, selections, rankedSubscriptions] = await Promise.all([
      this.prisma.eventSubscription.aggregate({
        where: { eventId },
        _count: true,
        _max: { createdAt: true, deletedAt: true },
      }),
      this.eventSubscriptionGroupFingerprint({ eventId }),
      this.prisma.eventLecturer.aggregate({
        where: { eventId },
        _count: true,
        _max: { createdAt: true },
      }),
      this.prisma.majorEventSubscriptionEventSelection.aggregate({
        where: { eventId },
        _count: true,
        _max: { createdAt: true, deletedAt: true },
      }),
      this.prisma.majorEventSubscription.aggregate({
        where: { selectedEvents: { some: { eventId } } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
    ]);
    return {
      type: 'EVENT_SUBSCRIPTIONS_INVALIDATED',
      subscriptions,
      subscriptionGroups,
      lecturers,
      selections,
      rankedSubscriptions,
    };
  }

  async majorEventSubscriptions(majorEventId: string): Promise<MajorEventSubscriptionsRealtimeFingerprint> {
    const [subscriptions, selections, receipts, applications, participants, teams, members, registrationMembers] =
      await Promise.all([
      this.prisma.majorEventSubscription.aggregate({
        where: { majorEventId },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
      this.prisma.majorEventSubscriptionEventSelection.aggregate({
        where: { subscription: { majorEventId } },
        _count: true,
        _max: { createdAt: true, deletedAt: true },
      }),
      this.prisma.majorEventReceipt.aggregate({
        where: { subscription: { majorEventId } },
        _count: true,
        _max: { updatedAt: true },
      }),
      this.prisma.sportsPlayerApplication.aggregate({
        where: { tournament: { majorEventId } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
      this.prisma.sportsTournamentParticipant.aggregate({
        where: { tournament: { majorEventId } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
      this.prisma.sportsTeam.aggregate({
        where: { tournament: { majorEventId } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
      this.prisma.sportsTeamMember.aggregate({
        where: { participant: { tournament: { majorEventId } } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
      this.prisma.sportsRegistrationMember.aggregate({
        where: { registration: { category: { tournament: { majorEventId } } } },
        _count: true,
        _max: { updatedAt: true, deletedAt: true },
      }),
    ]);
    return {
      type: 'MAJOR_EVENT_SUBSCRIPTIONS_INVALIDATED',
      subscriptions,
      selections,
      receipts,
      applications,
      participants,
      teams,
      members,
      registrationMembers,
    };
  }

  private async eventSubscriptionGroupFingerprint(where: { eventId: string } | { personId: string }): Promise<string> {
    const subscriptions = await this.prisma.eventSubscription.findMany({
      where,
      select: { id: true, eventGroupSubscriptionId: true },
      orderBy: { id: 'asc' },
    });
    const digest = createHash('sha256');
    for (const subscription of subscriptions) {
      digest.update(subscription.id);
      digest.update('\0');
      digest.update(subscription.eventGroupSubscriptionId ?? '');
      digest.update('\0');
    }
    return digest.digest('base64url');
  }
}
