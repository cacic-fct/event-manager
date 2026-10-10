import { ConflictException } from '@nestjs/common';
import { parseMovedRelations, parsePersonSnapshot, toPersonSnapshot, toPersonUpdateData } from './snapshots';

describe('merge candidate snapshot helpers', () => {
  it('serializes and restores person snapshots', () => {
    const source = person({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: new Date('2026-05-21T12:00:00.000Z'),
    });

    const snapshot = toPersonSnapshot(source);

    expect(snapshot).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: '2026-05-21T12:00:00.000Z',
    });
    expect(toPersonUpdateData(snapshot)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      secondaryEmails: ['alt@example.com'],
      identityDocument: '52998224725',
      academicId: 'RA1',
      userId: 'user-1',
      externalRef: 'ext-1',
      mergedIntoId: 'target-1',
      deletedAt: new Date('2026-05-21T12:00:00.000Z'),
    });
  });

  it('parses legacy person snapshots without secondary emails', () => {
    expect(
      parsePersonSnapshot(
        {
          name: 'Grace Hopper',
          email: null,
          identityDocument: null,
          academicId: null,
          userId: null,
          externalRef: null,
          mergedIntoId: null,
          deletedAt: null,
        },
        'sourceSnapshot',
      ),
    ).toEqual({
      name: 'Grace Hopper',
      email: null,
      secondaryEmails: [],
      identityDocument: null,
      academicId: null,
      userId: null,
      externalRef: null,
      mergedIntoId: null,
      deletedAt: null,
    });
  });

  it('parses moved relation payloads with optional group subscription ids', () => {
    expect(
      parseMovedRelations({
        sourceAttendances: [
          {
            eventId: 'event-1',
            status: 'ABSENT',
            category: 'REGULAR',
            currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
            attendedAt: '2026-05-21T12:00:00.000Z',
            createdAt: '2026-05-21T11:00:00.000Z',
            createdById: null,
            committedById: 'committer-1',
            createdByMethod: 'ORAL_CALL',
            collectedLatitude: -22.1,
            collectedLongitude: -51.4,
            collectedAccuracyMeters: 8,
          },
        ],
        sourceLectures: [
          {
            eventId: 'event-2',
            createdAt: '2026-05-21T10:00:00.000Z',
            createdById: 'actor-1',
          },
        ],
        insertedAttendanceEventIds: ['event-1'],
        insertedLectureEventIds: ['event-2'],
        movedEventSubscriptionIds: ['subscription-1'],
        movedAudienceInvitationSnapshots: [],
        movedMajorEventSubscriptionIds: ['major-subscription-1'],
      }),
    ).toEqual({
      sourceAttendances: [
        {
          eventId: 'event-1',
          status: 'ABSENT',
          category: 'REGULAR',
          currentAssessment: 'REQUIREMENTS_CURRENTLY_MET',
          attendedAt: '2026-05-21T12:00:00.000Z',
          createdAt: '2026-05-21T11:00:00.000Z',
          createdById: null,
          committedById: 'committer-1',
          createdByMethod: 'ORAL_CALL',
          collectedLatitude: -22.1,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 8,
        },
      ],
      sourceLectures: [
        {
          eventId: 'event-2',
          createdAt: '2026-05-21T10:00:00.000Z',
          createdById: 'actor-1',
        },
      ],
      insertedAttendanceEventIds: ['event-1'],
      insertedLectureEventIds: ['event-2'],
      movedEventSubscriptionIds: ['subscription-1'],
      movedAudienceInvitationSnapshots: [],
      movedEventGroupSubscriptionIds: [],
      movedMajorEventSubscriptionIds: ['major-subscription-1'],
      movedRoleAssignmentIds: [],
      archivedRoleAssignmentIds: [],
      movedPermissionGroupMembershipIds: [],
      archivedPermissionGroupMembershipIds: [],
      roleAssignmentSnapshots: [],
      roleAssignmentScopeSnapshots: [],
      permissionGroupMembershipSnapshots: [],
      movedSportsTeamRepresentativeIds: [],
      revokedSportsTeamRepresentativeIds: [],
      sportsTeamRepresentativeSnapshots: [],
      movedSportsTournamentParticipantIds: [],
      sportsTournamentParticipantSnapshots: [],
      movedSportsOfficialAssignmentIds: [],
      sportsOfficialAssignmentSnapshots: [],
    });
  });

  it('parses invitation snapshots with notification provenance', () => {
    expect(
      parseMovedRelations({
        sourceAttendances: [],
        sourceLectures: [],
        insertedAttendanceEventIds: [],
        insertedLectureEventIds: [],
        movedEventSubscriptionIds: [],
        movedMajorEventSubscriptionIds: [],
        movedAudienceInvitationSnapshots: [
          {
            targetType: 'EVENT',
          coalesced: true,
            targetId: 'event-1',
            personId: 'source-person',
            createdAt: '2026-01-01T10:00:00.000Z',
            createdById: 'creator-1',
            notifiedAt: '2026-01-02T10:00:00.000Z',
            notificationAttemptedAt: null,
          },
        ],
      }),
    ).toEqual({
      sourceAttendances: [],
      sourceLectures: [],
      insertedAttendanceEventIds: [],
      insertedLectureEventIds: [],
      movedEventSubscriptionIds: [],
      movedEventGroupSubscriptionIds: [],
      movedMajorEventSubscriptionIds: [],
      movedAudienceInvitationSnapshots: [
        {
          targetType: 'EVENT',
          coalesced: true,
          targetId: 'event-1',
          personId: 'source-person',
          createdAt: '2026-01-01T10:00:00.000Z',
          createdById: 'creator-1',
          notifiedAt: '2026-01-02T10:00:00.000Z',
          notificationAttemptedAt: null,
        },
      ],
      movedRoleAssignmentIds: [],
      archivedRoleAssignmentIds: [],
      movedPermissionGroupMembershipIds: [],
      archivedPermissionGroupMembershipIds: [],
      roleAssignmentSnapshots: [],
      roleAssignmentScopeSnapshots: [],
      permissionGroupMembershipSnapshots: [],
      movedSportsTeamRepresentativeIds: [],
      revokedSportsTeamRepresentativeIds: [],
      sportsTeamRepresentativeSnapshots: [],
      movedSportsTournamentParticipantIds: [],
      sportsTournamentParticipantSnapshots: [],
      movedSportsOfficialAssignmentIds: [],
      sportsOfficialAssignmentSnapshots: [],
    });
  });

  it('parses ticket identity and expected merge state for safe undo', () => {
    const movedRelations = parseMovedRelations({
      sourceAttendances: [],
      sourceLectures: [],
      insertedAttendanceEventIds: [],
      insertedLectureEventIds: [],
      movedEventSubscriptionIds: [],
      movedMajorEventSubscriptionIds: [],
      ticketRelations: {
        holderSnapshots: [
          {
            action: 'MOVED',
            id: 'ticket-1',
            eventId: 'event-1',
            sourceKey: 'event-subscription:event-1:source-person',
            originalHolderPersonId: 'source-person',
            holderPersonId: 'source-person',
            status: 'ACTIVE',
            revokedAt: null,
            revokedReason: null,
            expectedHolderPersonId: 'target-person',
            expectedStatus: 'ACTIVE',
            expectedRevokedAt: null,
            expectedRevokedReason: null,
          },
        ],
        transferSnapshots: [],
        purchaseSnapshots: [
          {
            id: 'purchase-1',
            ticketConfigId: 'ticket-config-1',
            personId: 'source-person',
            majorEventSubscriptionId: 'source-subscription',
            status: 'UNDER_REVIEW',
            expectedPersonId: 'target-person',
            expectedMajorEventSubscriptionId: 'target-subscription',
            expectedStatus: 'UNDER_REVIEW',
          },
        ],
      },
    });

    expect(movedRelations.ticketRelations).toEqual({
      holderSnapshots: [
        expect.objectContaining({
          action: 'MOVED',
          id: 'ticket-1',
          sourceKey: 'event-subscription:event-1:source-person',
          originalHolderPersonId: 'source-person',
          expectedHolderPersonId: 'target-person',
        }),
      ],
      transferSnapshots: [],
      purchaseSnapshots: [
        expect.objectContaining({
          id: 'purchase-1',
          personId: 'source-person',
          majorEventSubscriptionId: 'source-subscription',
          expectedPersonId: 'target-person',
          expectedMajorEventSubscriptionId: 'target-subscription',
        }),
      ],
    });
  });

  it('rejects malformed snapshot payloads', () => {
    expect(() => parsePersonSnapshot(null, 'targetSnapshot')).toThrow(ConflictException);
    expect(() =>
      parseMovedRelations({
        sourceAttendances: [{}],
        sourceLectures: [],
        insertedAttendanceEventIds: [],
        insertedLectureEventIds: [],
        movedEventSubscriptionIds: [],
        movedMajorEventSubscriptionIds: [],
      }),
    ).toThrow(ConflictException);
  });

  it('rejects legacy attendance snapshots without status or provenance', () => {
    expect(() =>
      parseMovedRelations({
        sourceAttendances: [
          {
            eventId: 'event-1',
            attendedAt: '2026-05-21T12:00:00.000Z',
            createdAt: '2026-05-21T11:00:00.000Z',
            createdById: null,
            committedById: null,
          },
        ],
        sourceLectures: [],
        insertedAttendanceEventIds: [],
        insertedLectureEventIds: [],
        movedEventSubscriptionIds: [],
        movedMajorEventSubscriptionIds: [],
      }),
    ).toThrow(ConflictException);
  });
});

function person(overrides: Partial<ReturnType<typeof personShape>>) {
  return {
    ...personShape(),
    ...overrides,
  } as never;
}

function personShape() {
  return {
    id: 'person-1',
    name: 'Person Name',
    email: null,
    secondaryEmails: [] as string[],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    mergedIntoId: null,
    externalRef: null,
    deletedAt: null as Date | null,
    createdAt: new Date('2026-05-21T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    updatedById: null,
    isCPF: null,
  };
}
